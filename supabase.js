// Variabel untuk menyimpan URL dan Kunci Supabase Anda
const supabaseUrl = 'https://vbvcydgjptjroclgcxzw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZidmN5ZGdqcHRqcm9jbGdjeHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzMzYwODgsImV4cCI6MjA3MDkxMjA4OH0.7qhvpdcrMktJMISBzwU-PfVdSHqDnrOQKDM18-hMYN8';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

function attendanceApp() {
    return {
        // Current state
        currentPage: 'login',
        currentUser: null,
        currentTime: '',
        currentDate: '',
        adminTab: 'overview',
        isLoading: false, // ✅ TAMBAH: property isLoading
        
        // Modals
        showLoginModal: false,
        showAttendanceModal: false,
        showEmployeeFormModal: false,
        showEditAttendanceModal: false,
        loginType: 'employee',
        
        // Forms
        loginForm: { username: '', password: '' },
        attendanceForm: { type: '', reason: '' },
        employeeForm: { id: null, name: '', position: '', username: '', password: '', status: 'active' },
        editAttendanceForm: { id: null, employeeId: null, date: '', status: '', adminNote: '' },
        reportFilter: { 
            month: new Date().toISOString().slice(0, 7),
        },
        
        // Data
        employees: [],
        attendanceRecords: [],
        todayAttendance: null,
        monthlyStats: { present: 0, late: 0, sick: 0, leave: 0, absent: 0 }, // ✅ TAMBAH: absent
        monthlyReportStats: { present: 0, late: 0, sick: 0, leave: 0, wfe: 0, absent: 0 }, // ✅ TAMBAH: absent
        attendanceHistory: [],
        allAttendanceRecords: [],
        
        // Chart instance
        chartInstance: null,
        
        init() {
            this.updateDateTime();
            setInterval(() => this.updateDateTime(), 1000);
            this.loadInitialData();
        },
        
        async loadInitialData() {
            this.isLoading = true;
            try {
                const { data: employeesData, error: employeesError } = await supabaseClient
                    .from('employees')
                    .select('*');

                if (employeesError) throw employeesError;
                this.employees = employeesData;

                const { data: attendanceData, error: attendanceError } = await supabaseClient
                    .from('attendance_records')
                    .select('*');

                if (attendanceError) throw attendanceError;

                this.attendanceRecords = attendanceData.map(record => ({
                    id: record.id,
                    employeeId: record.employee_id,
                    date: record.date,
                    time: record.time,
                    status: record.status,
                    reason: record.reason || '',
                    adminNote: record.admin_note || ''
                }));

                if (this.currentUser) {
                    this.updateAttendanceData();
                }
                
                // ✅ TAMBAH: Update reports setelah data dimuat
                this.updateReports();
            } catch (error) {
                console.error('Error fetching data from Supabase:', error);
                alert('Gagal memuat data dari database. Silakan coba lagi.');
            } finally {
                this.isLoading = false;
            }
        },
        
        updateDateTime() {
            const now = new Date();
            const options = { timeZone: 'Asia/Jakarta' };
            this.currentTime = now.toLocaleTimeString('id-ID', options);
            this.currentDate = now.toLocaleDateString('id-ID', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                timeZone: 'Asia/Jakarta' 
            });
        },
        
        showLogin(type) {
            this.loginType = type;
            this.showLoginModal = true;
            this.loginForm = { username: '', password: '' };
        },
        
        closeLoginModal() {
            this.showLoginModal = false;
        },
        
        async login() {
            this.isLoading = true;
            const { username, password } = this.loginForm;

            try {
                if (this.loginType === 'admin') {
                    if (username === 'admin' && password === 'admin123') {
                        this.currentUser = { id: 'admin', name: 'Administrator', role: 'admin' };
                        this.currentPage = 'admin';
                        this.closeLoginModal();
                        await this.loadInitialData(); // ✅ PERBAIKI: Load data dulu
                        this.$nextTick(() => {
                            setTimeout(() => this.initChart(), 300); // ✅ PERBAIKI: Delay lebih lama
                        });
                    } else {
                        alert('Username atau password admin salah!');
                    }
                } else {
                    const { data, error } = await supabaseClient
                        .from('employees')
                        .select('*')
                        .eq('username', username)
                        .eq('password', password)
                        .eq('status', 'active')
                        .single();

                    if (error) {
                        alert('Username atau password salah, atau akun tidak aktif!');
                    } else {
                        this.currentUser = { ...data, role: 'employee' };
                        this.currentPage = 'employee';
                        this.updateAttendanceData();
                        this.closeLoginModal();
                    }
                }
            } catch (err) {
                console.error('Login error:', err);
                alert('Terjadi kesalahan saat login.');
            } finally {
                this.isLoading = false;
            }
        },
        
        logout() {
            this.currentUser = null;
            this.currentPage = 'login';
            this.todayAttendance = null;
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
        },
        
        updateAttendanceData() {
            if (!this.currentUser || this.currentUser.role !== 'employee') return;
            
            const today = new Date().toDateString();
            this.todayAttendance = this.attendanceRecords.find(record => 
                record.employeeId === this.currentUser.id && 
                new Date(record.date).toDateString() === today
            );
            
            const thisMonth = new Date();
            const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
            const monthEnd = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 0);
            
            const jakartaToday = new Date(thisMonth.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
            const endDate = jakartaToday < monthEnd ? jakartaToday : monthEnd;
            
            const monthlyRecords = this.attendanceRecords.filter(record => {
                const recordDate = new Date(record.date + 'T00:00:00');
                return record.employeeId === this.currentUser.id &&
                       recordDate >= monthStart && recordDate <= monthEnd;
            });
            
            // Hitung alfa untuk employee ini
            let absentCount = 0;
            for (let d = new Date(monthStart); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;
                
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                const hasRecord = this.attendanceRecords.some(record => 
                    record.employeeId === this.currentUser.id && 
                    record.date === dateStr
                );
                
                if (!hasRecord) {
                    absentCount++;
                }
            }
            
            this.monthlyStats = {
                present: monthlyRecords.filter(r => r.status === 'present' || r.status === 'wfe').length,
                late: monthlyRecords.filter(r => r.status === 'late').length,
                sick: monthlyRecords.filter(r => r.status === 'sick').length,
                leave: monthlyRecords.filter(r => r.status === 'leave').length,
                absent: absentCount // Gunakan perhitungan otomatis
            };
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            this.attendanceHistory = this.attendanceRecords
                .filter(record => {
                    const recordDate = new Date(record.date);
                    const dayOfWeek = recordDate.getDay();
                    return record.employeeId === this.currentUser.id &&
                           recordDate >= thirtyDaysAgo &&
                           dayOfWeek !== 0 && dayOfWeek !== 6;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 20);
        },
        
        // ✅ PERBAIKI: Update reports dengan perhitungan alfa OTOMATIS
        updateReports() {
            const [year, month] = this.reportFilter.month.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0);
            
            // Gunakan tanggal lokal Jakarta
            const today = new Date();
            const jakartaToday = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
            
            let filteredRecords = this.attendanceRecords.filter(record => {
                const recordDate = new Date(record.date + 'T00:00:00');
                return recordDate >= monthStart && recordDate <= monthEnd;
            });
            
            // Hitung alfa otomatis
            let absentCount = 0;
            const endDate = jakartaToday < monthEnd ? jakartaToday : monthEnd;
            
            // Loop hari kerja yang sudah lewat
            for (let d = new Date(monthStart); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekend
                
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                // Cek setiap pegawai aktif
                this.employees.filter(emp => emp.status === 'active').forEach(employee => {
                    const hasRecord = this.attendanceRecords.some(record => 
                        record.employeeId === employee.id && 
                        record.date === dateStr
                    );
                    
                    if (!hasRecord) {
                        absentCount++;
                    }
                });
            }
            
            console.log('Alfa Count:', absentCount); // Debug log
            
            this.monthlyReportStats = {
                present: filteredRecords.filter(r => r.status === 'present').length,
                late: filteredRecords.filter(r => r.status === 'late').length,
                sick: filteredRecords.filter(r => r.status === 'sick').length,
                leave: filteredRecords.filter(r => r.status === 'leave').length,
                wfe: filteredRecords.filter(r => r.status === 'wfe').length,
                absent: absentCount
            };
            
            this.updateChart();
        },
        
        // ✅ PERBAIKI: Update chart dengan data alfa
        updateChart() {
            if (!this.chartInstance) return;
            
            this.chartInstance.data.datasets[0].data = [
                this.monthlyReportStats.present,
                this.monthlyReportStats.late,
                this.monthlyReportStats.sick,
                this.monthlyReportStats.leave,
                this.monthlyReportStats.wfe,
                this.monthlyReportStats.absent // ✅ TAMBAH
            ];
            this.chartInstance.update();
        },
        
        showAttendanceForm(type) {
            this.attendanceForm = { type, reason: '' };
            this.showAttendanceModal = true;
        },
        
        closeAttendanceModal() {
            this.showAttendanceModal = false;
        },
        
        async markAttendance(status) {
            this.isLoading = true;
            const now = new Date();
            const options = { timeZone: 'Asia/Jakarta' };
            
            const year = now.toLocaleString('en-US', { year: 'numeric', timeZone: 'Asia/Jakarta' });
            const month = now.toLocaleString('en-US', { month: '2-digit', timeZone: 'Asia/Jakarta' });
            const day = now.toLocaleString('en-US', { day: '2-digit', timeZone: 'Asia/Jakarta' });
            const jakartaDate = `${year}-${month}-${day}`;

            const attendance = {
                employee_id: this.currentUser.id,
                date: jakartaDate,
                time: now.toLocaleTimeString('id-ID', options),
                status: status,
                reason: ''
            };

            try {
                const { data, error } = await supabaseClient
                    .from('attendance_records')
                    .insert([attendance])
                    .select();

                if (error) throw error;

                const savedRecord = {
                    id: data[0].id,
                    employeeId: data[0].employee_id,
                    date: data[0].date,
                    time: data[0].time,
                    status: data[0].status,
                    reason: data[0].reason || ''
                };
                
                this.attendanceRecords.push(savedRecord);
                this.updateAttendanceData();
                alert('Absensi berhasil dicatat!');
            } catch (err) {
                console.error('Error submitting attendance:', err);
                alert(`Gagal mencatat absensi: ${err.message}`);
            } finally {
                this.isLoading = false;
            }
        },

        async submitAttendanceForm() {
            this.isLoading = true;
            const now = new Date();
            const options = { timeZone: 'Asia/Jakarta' };
            const jakartaDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            
            const newAttendance = {
                employee_id: this.currentUser.id,
                date: jakartaDate,
                time: now.toLocaleTimeString('id-ID', options),
                status: this.attendanceForm.type,
                reason: this.attendanceForm.reason
            };

            try {
                const { data, error } = await supabaseClient
                    .from('attendance_records')
                    .insert([newAttendance])
                    .select();

                if (error) throw error;

                const savedRecord = {
                    id: data[0].id,
                    employeeId: data[0].employee_id,
                    date: data[0].date,
                    time: data[0].time,
                    status: data[0].status,
                    reason: data[0].reason || ''
                };
                
                this.attendanceRecords.push(savedRecord);
                this.updateAttendanceData();
                this.closeAttendanceModal();
                alert('Absensi berhasil dicatat!');
            } catch (err) {
                console.error('Error submitting attendance:', err);
                alert(`Gagal mencatat absensi: ${err.message}`);
            } finally {
                this.isLoading = false;
            }
        },
        
        getAttendanceModalTitle() {
            const titles = {
                late: 'Form Terlambat',
                sick: 'Form Sakit',
                leave: 'Form Izin',
                wfe: 'Form Tugas Diluar'
            };
            return titles[this.attendanceForm.type] || 'Form Absensi';
        },
        
        showEmployeeModal(employee = null) {
            if (employee) {
                this.employeeForm = { ...employee, password: '' };
            } else {
                this.employeeForm = { id: null, name: '', position: '', username: '', password: '', status: 'active' };
            }
            this.showEmployeeFormModal = true;
        },
        
        closeEmployeeModal() {
            this.showEmployeeFormModal = false;
        },
        
        async submitEmployeeForm() {
            this.isLoading = true;
            try {
                if (this.employeeForm.id) {
                    const { error } = await supabaseClient
                        .from('employees')
                        .update({
                            name: this.employeeForm.name,
                            username: this.employeeForm.username,
                            position: this.employeeForm.position,
                            status: this.employeeForm.status
                        })
                        .eq('id', this.employeeForm.id);

                    if (error) throw error;
                } else {
                    const { error } = await supabaseClient
                        .from('employees')
                        .insert({
                            name: this.employeeForm.name,
                            username: this.employeeForm.username,
                            password: this.employeeForm.password,
                            position: this.employeeForm.position,
                            status: this.employeeForm.status
                        });

                    if (error) throw error;
                }
                await this.loadInitialData();
                this.closeEmployeeModal();
                alert(this.employeeForm.id ? 'Pegawai berhasil diupdate!' : 'Pegawai berhasil ditambahkan!');
            } catch (err) {
                console.error('Error submitting employee form:', err);
                alert('Terjadi kesalahan saat menyimpan data pegawai.');
            } finally {
                this.isLoading = false;
            }
        },
        
        editEmployee(employee) {
            this.showEmployeeModal(employee);
        },
        
        async deleteEmployee(employeeId) {
            if (confirm('Yakin ingin menghapus pegawai ini?')) {
                this.isLoading = true;
                try {
                    const { error } = await supabaseClient
                        .from('employees')
                        .delete()
                        .eq('id', employeeId);

                    if (error) throw error;

                    await this.loadInitialData();
                    alert('Pegawai berhasil dihapus!');
                } catch (err) {
                    console.error('Error deleting employee:', err);
                    alert('Terjadi kesalahan saat menghapus pegawai.');
                } finally {
                    this.isLoading = false;
                }
            }
        },
        
        editAttendanceRecord(record) {
            this.editAttendanceForm = { ...record };
            this.showEditAttendanceModal = true;
        },
        
        closeEditAttendanceModal() {
            this.showEditAttendanceModal = false;
        },
        
        async submitEditAttendance() {
            this.isLoading = true;
            try {
                const updateData = {
                    employee_id: this.editAttendanceForm.employeeId,
                    date: this.editAttendanceForm.date,
                    status: this.editAttendanceForm.status,
                    admin_note: this.editAttendanceForm.adminNote
                };
                
                const { error } = await supabaseClient
                    .from('attendance_records')
                    .update(updateData)
                    .eq('id', this.editAttendanceForm.id);

                if (error) throw error;

                await this.loadInitialData();
                this.closeEditAttendanceModal();
                alert('Absensi berhasil diupdate!');
            } catch (err) {
                console.error('Error updating attendance record:', err);
                alert(`Terjadi kesalahan: ${err.message}`);
            } finally {
                this.isLoading = false;
            }
        },
        
        exportMonthlyReport() {
            const [year, month] = this.reportFilter.month.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0);
            
            let filteredRecords = this.attendanceRecords.filter(record => {
                const recordDate = new Date(record.date);
                return recordDate >= monthStart && recordDate <= monthEnd;
            });
            
            const headers = ['Nama', 'Tanggal', 'Waktu', 'Status', 'Keterangan'];
            const rows = filteredRecords.map(record => {
                const employee = this.employees.find(emp => emp.id === record.employeeId);
                return [
                    employee ? employee.name : 'Unknown',
                    this.formatDate(record.date),
                    record.time,
                    this.getStatusText(record.status),
                    record.reason || record.adminNote || ''
                ];
            });
            
            const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const monthName = new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            a.download = `laporan_absensi_${monthName.replace(' ', '_')}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        },
        
        getSelectedMonthText() {
            if (!this.reportFilter.month) return 'Bulan Ini';
            const [year, month] = this.reportFilter.month.split('-').map(Number);
            return new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        },
        
        getFilteredEmployees() {
            return this.employees;
        },
        
        // ✅ PERBAIKI: Tambahkan absent ke stats dengan perhitungan otomatis
        getMonthlyEmployeeStats(employeeId) {
            const [year, month] = this.reportFilter.month.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0);
            
            const today = new Date();
            const jakartaToday = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
            const endDate = jakartaToday < monthEnd ? jakartaToday : monthEnd;
            
            const monthlyRecords = this.attendanceRecords.filter(record => {
                const recordDate = new Date(record.date + 'T00:00:00');
                return record.employeeId === employeeId &&
                       recordDate >= monthStart && recordDate <= monthEnd;
            });
            
            // Hitung alfa otomatis untuk pegawai ini
            let absentCount = 0;
            for (let d = new Date(monthStart); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;
                
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                const hasRecord = this.attendanceRecords.some(record => 
                    record.employeeId === employeeId && 
                    record.date === dateStr
                );
                
                if (!hasRecord) {
                    absentCount++;
                }
            }
            
            return {
                present: monthlyRecords.filter(r => r.status === 'present').length,
                late: monthlyRecords.filter(r => r.status === 'late').length,
                sick: monthlyRecords.filter(r => r.status === 'sick').length,
                leave: monthlyRecords.filter(r => r.status === 'leave').length,
                wfe: monthlyRecords.filter(r => r.status === 'wfe').length,
                absent: absentCount
            };
        },
        
        getMonthlyAttendanceRate(employeeId) {
            const [year, month] = this.reportFilter.month.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0);
            
            let workingDays = 0;
            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                if (d.getDay() !== 0 && d.getDay() !== 6) workingDays++;
            }
            
            const presentRecords = this.attendanceRecords.filter(record => {
                const recordDate = new Date(record.date);
                return record.employeeId === employeeId &&
                       recordDate >= monthStart && recordDate <= monthEnd &&
                       ['present', 'late', 'wfe'].includes(record.status);
            }).length;
            
            return workingDays > 0 ? Math.round((presentRecords / workingDays) * 100) : 0;
        },
        
        // ✅ PERBAIKI: Tambahkan absent ke statusText
        getStatusText(status) {
            const statusTexts = {
                present: 'Hadir',
                late: 'Terlambat',
                sick: 'Sakit',
                leave: 'Izin',
                wfe: 'Tugas Diluar',
                absent: 'Alfa'
            };
            return statusTexts[status] || status;
        },
        
        getStatusClass(status) {
            const statusClasses = {
                present: 'bg-emerald-100 text-emerald-800',
                late: 'bg-amber-100 text-amber-800',
                sick: 'bg-red-100 text-red-800',
                leave: 'bg-slate-100 text-slate-800',
                wfe: 'bg-blue-100 text-blue-800',
                absent: 'bg-red-200 text-red-900' // ✅ TAMBAH
            };
            return statusClasses[status] || 'bg-slate-100 text-slate-800';
        },
        
        formatDate(dateString) {
            return new Date(dateString).toLocaleDateString('id-ID', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },
        
        getEmployeeName(employeeId) {
            const employee = this.employees.find(emp => emp.id === employeeId);
            return employee ? employee.name : 'Unknown';
        },
        
        getTodayStatusText(employeeId) {
            const today = new Date().toDateString();
            const record = this.attendanceRecords.find(record => 
                record.employeeId === employeeId && 
                new Date(record.date).toDateString() === today
            );
            return record ? this.getStatusText(record.status) : 'Belum Absen';
        },
        
        getTodayStatusClass(employeeId) {
            const today = new Date().toDateString();
            const record = this.attendanceRecords.find(record => 
                record.employeeId === employeeId && 
                new Date(record.date).toDateString() === today
            );
            return record ? this.getStatusClass(record.status) : 'bg-slate-100 text-slate-800';
        },
        
        getAttendanceRate(employeeId) {
            const thisMonth = new Date();
            const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
            const monthEnd = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 0);
            
            let workingDays = 0;
            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                if (d.getDay() !== 0 && d.getDay() !== 6) workingDays++;
            }
            
            const presentRecords = this.attendanceRecords.filter(record => {
                const recordDate = new Date(record.date);
                return record.employeeId === employeeId &&
                       recordDate >= monthStart && recordDate <= monthEnd &&
                       ['present', 'late', 'wfe'].includes(record.status);
            }).length;
            
            return workingDays > 0 ? Math.round((presentRecords / workingDays) * 100) : 0;
        },
        
        get todayPresentCount() {
            const today = new Date().toDateString();
            return this.attendanceRecords.filter(record => 
                new Date(record.date).toDateString() === today &&
                ['present', 'late', 'wfe'].includes(record.status)
            ).length;
        },
        
        get allAttendanceRecords() {
            return this.attendanceRecords
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 50);
        },
        
        updateAllAttendanceRecords() {
            this.attendanceRecords = [...this.attendanceRecords];
        },
        
        // ✅ PERBAIKI: Inisialisasi chart dengan data alfa
        initChart() {
            const ctx = document.getElementById('attendanceChart');
            if (!ctx) {
                console.error('Canvas element not found');
                return;
            }
            
            if (this.chartInstance) {
                this.chartInstance.destroy();
            }
            
            this.chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Hadir', 'Terlambat', 'Sakit', 'Izin', 'Tugas Diluar', 'Alfa'], // ✅ TAMBAH Alfa
                    datasets: [{
                        label: 'Jumlah',
                        data: [
                            this.monthlyReportStats.present,
                            this.monthlyReportStats.late,
                            this.monthlyReportStats.sick,
                            this.monthlyReportStats.leave,
                            this.monthlyReportStats.wfe,
                            this.monthlyReportStats.absent // ✅ TAMBAH
                        ],
                        backgroundColor: [
                            '#059669',
                            '#d97706',
                            '#dc2626',
                            '#64748b',
                            '#2563eb',
                            '#991b1b' // ✅ TAMBAH warna untuk Alfa
                        ],
                        borderWidth: 0,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: '#f1f5f9'
                            },
                            ticks: {
                                color: '#64748b',
                                stepSize: 1
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: '#64748b'
                            }
                        }
                    }
                }
            });
        }
    }
}
