import React, { useState, useRef } from "react";
import { Search, UserPlus, Pencil, ToggleLeft, ToggleRight, CheckCircle, XCircle, Clock, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { Modal } from "../../components/Modal";
import { EmployeeDirectoryTable, EmployeeData } from "../../components/EmployeeDirectoryTable";
import { useLeave } from "../../context/LeaveContext";
import { userService } from "../../services/userService";
import { adminService } from "../../services/adminService";
import { toast } from "sonner";

type Role = "EMPLOYEE" | "INTERN" | "MANAGER" | "HR_ADMIN" | "employee" | "intern" | "manager" | "hr_admin";

const roleColors: Record<Role, string> = {
  EMPLOYEE: "bg-green-100 text-green-700",
  INTERN: "bg-cyan-100 text-cyan-700",
  MANAGER: "bg-blue-100 text-blue-700",
  HR_ADMIN: "bg-purple-100 text-purple-700",
  employee: "bg-green-100 text-green-700",
  intern: "bg-cyan-100 text-cyan-700",
  manager: "bg-blue-100 text-blue-700",
  hr_admin: "bg-purple-100 text-purple-700",
};

export default function UserManagement() {
  const { allUsers, leaveTypes, leaveRequests, fetchUsers, isLoading, refreshAllData } = useLeave();
  const [activeTab, setActiveTab] = useState<"active" | "pending">("active");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [balanceReason, setBalanceReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [departmentRequests, setDepartmentRequests] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importResults, setImportResults] = useState<{ total: number; success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ensure data is loaded when component mounts
  React.useEffect(() => {
    // If we don't have users and we're not loading, trigger a refresh
    if (allUsers.length === 0 && !isLoading) {
      console.log("UserManagement - No users found, triggering refresh");
      refreshAllData();
    }
  }, []); // Only run once on mount

  // Debug logging
  console.log("UserManagement - allUsers:", allUsers.length);
  console.log("UserManagement - leaveTypes:", leaveTypes.length);
  console.log("UserManagement - isLoading:", isLoading);

  React.useEffect(() => {
    adminService
      .getDepartmentChangeRequests()
      .then((res) => setDepartmentRequests(res.data.requests || []))
      .catch(() => undefined);
  }, []);

  const departments = [...new Set(allUsers.map(u => u.department).filter(Boolean))];

  // Separate active and pending users
  const activeUsers = allUsers.filter(u => u.isActive);
  const pendingUsers = allUsers.filter(u => !u.isActive);

  const usersToDisplay = activeTab === "active" ? activeUsers : pendingUsers;
  const roleKey = (role: string) => String(role || "").toUpperCase();
  const roleLabel = (role: string) => {
    const key = roleKey(role);
    if (key === "HR_ADMIN") return "HR Admin";
    if (key === "MANAGER") return "Manager";
    if (key === "INTERN") return "Interns";
    return "Employee";
  };

  const filtered = usersToDisplay.filter(u => {
    const matchSearch = (u.name?.toLowerCase() || "").includes(search.toLowerCase()) || (u.email?.toLowerCase() || "").includes(search.toLowerCase());
    const matchRole = roleFilter === "ALL" || roleKey(u.role) === roleKey(roleFilter);
    const matchDept = deptFilter === "ALL" || u.department === deptFilter;
    return matchSearch && matchRole && matchDept;
  });

  // Transform users to EmployeeData format for the table component
  // Only transform if we have data to avoid empty state
  const transformedEmployees: EmployeeData[] = React.useMemo(() => {
    if (!filtered || filtered.length === 0) return [];
    
    return filtered.map(u => {
      // Ensure we have valid data
      if (!u) return null;
      
      return {
        id: u._id || u.id || '',
        name: u.name || '',
        email: u.email || '',
        department: u.department || '',
        designation: u.designation || '',
        role: ((roleKey(u.role || "EMPLOYEE")) as "EMPLOYEE" | "MANAGER" | "HR_ADMIN"),
        joinDate: u.joinDate || u.createdAt || '',
        isActive: u.isActive ?? true,
        probationStatus: u.probationStatus ?? false,
        leaveBalances: (u.leaveBalances || []).map((bal: any) => {
          const leaveType = leaveTypes.find(lt => (lt._id || lt.id) === (bal.leaveTypeId?._id || bal.leaveTypeId));
          return {
            code: leaveType?.code || 'N/A',
            name: leaveType?.name || 'Unknown',
            balance: bal.balance || 0,
            color: leaveType?.color || '#6B7280',
          };
        }),
      };
    }).filter(Boolean) as EmployeeData[];
  }, [filtered, leaveTypes]);

  const handleApprove = async (userId: string) => {
    try {
      await userService.activateUser(userId);
      toast.success("User approved and activated successfully");
      await fetchUsers();
    } catch (error: any) {
      console.error("Error approving user:", error);
      toast.error(error.response?.data?.message || "Failed to approve user");
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm("Are you sure you want to reject this user registration? This will delete the user account.")) {
      return;
    }
    try {
      await userService.deleteUser(userId);
      toast.success("User registration rejected and account deleted");
      await fetchUsers();
    } catch (error: any) {
      console.error("Error rejecting user:", error);
      toast.error(error.response?.data?.message || "Failed to reject user");
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }
    try {
      await userService.deleteUser(userId);
      toast.success("User deleted successfully");
      await fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.response?.data?.message || "Failed to delete user");
    }
  };

  const startEdit = (u: any) => {
    setEditingUser(u);
    setFormData({ 
      ...u,
      leaveBalances: u.leaveBalances || []
    });
    setBalanceReason("");
  };

  const startCreate = () => {
    setIsCreating(true);
    setFormData({
      name: "",
      email: "",
      password: "",
      phone: "",
      designation: "",
      role: "employee",
      department: "Engineering",
      joinDate: new Date().toISOString().slice(0, 10),
      isActive: true,
      probationStatus: true,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    setImportResults(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const rows = results.data as any[];
        let successCount = 0;
        let failCount = 0;
        const errs: string[] = [];
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            if (!row.Email || !row.Name || !row.Password || !row.Department) {
              throw new Error("Missing required fields (Name, Email, Password, Department)");
            }
            const payload = {
              name: row.Name,
              email: row.Email,
              password: row.Password,
              role: row.Role ? row.Role.toLowerCase() : "employee",
              department: row.Department,
              joinDate: row["Join Date"] || new Date().toISOString().slice(0, 10),
              designation: row.Designation || "",
              phone: row.Phone || "",
              isActive: true,
              probationStatus: true
            };
            
            await userService.createUser(payload);
            successCount++;
          } catch (error: any) {
            failCount++;
            errs.push(`Row ${i + 2} (${row.Email || 'Unknown'}): ${error.response?.data?.message || error.message}`);
          }
        }
        
        setIsSaving(false);
        setImportResults({ total: rows.length, success: successCount, failed: failCount, errors: errs });
        await fetchUsers();
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error: any) => {
        setIsSaving(false);
        toast.error("Failed to parse CSV file: " + error.message);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleCreate = async () => {
    if (isSaving) return;
    
    // Validation
    if (!formData.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formData.email?.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!formData.password?.trim() || formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!formData.department?.trim()) {
      toast.error("Department is required");
      return;
    }
    
    setIsSaving(true);
    try {
      await userService.createUser(formData);
      toast.success("User created successfully");
      setIsCreating(false);
      setFormData({});
      await fetchUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.response?.data?.message || "Failed to create user");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editingUser || isSaving) return;
    
    setIsSaving(true);
    try {
      const toId = (value: any) => String(value?._id || value || "");

      // Update user basic info
      const updateData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        designation: formData.designation,
        role: formData.role,
        department: formData.department,
        probationStatus: formData.probationStatus,
        isActive: formData.isActive, // Added isActive field
        joinDate: formData.joinDate,
      };
      
      await userService.updateUser(editingUser._id || editingUser.id, updateData);
      
      // Update leave balances if changed
      const originalBalances = editingUser.leaveBalances || [];
      const newBalances = formData.leaveBalances || [];

      const changedBalances: Array<{ leaveTypeId: string; newBalance: number; oldBalance: number }> = [];

      for (const leaveType of leaveTypes) {
        const ltId = toId(leaveType._id || leaveType.id);
        if (!ltId) continue;

        const originalBal = originalBalances.find((b: any) => toId(b.leaveTypeId) === ltId);
        const newBal = newBalances.find((b: any) => toId(b.leaveTypeId) === ltId);

        const originalBalance = Number(originalBal?.balance ?? 0);
        const updatedBalance = Number(newBal?.balance ?? 0);
        const roundedOld = Math.round(originalBalance * 100) / 100;
        const roundedNew = Math.round(updatedBalance * 100) / 100;

        if (roundedOld !== roundedNew) {
          changedBalances.push({ leaveTypeId: ltId, newBalance: roundedNew, oldBalance: roundedOld });
        }
      }

      if (changedBalances.length > 0) {
        const reasonToUse =
          balanceReason.trim() ||
          `Manual balance update by HR on ${new Date().toISOString().slice(0, 10)}`;

        for (const change of changedBalances) {
          await userService.updateLeaveBalance(
            editingUser._id || editingUser.id || '',
            change.leaveTypeId,
            change.newBalance,
            reasonToUse
          );
        }
      }
      
      toast.success("User updated successfully");
      setEditingUser(null);
      setFormData({});
      setBalanceReason("");
      
      // Refresh user list
      await fetchUsers();
      window.dispatchEvent(new CustomEvent('refreshBalances'));
      window.dispatchEvent(new CustomEvent('leaveDataUpdated'));
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast.error(error.response?.data?.message || "Failed to update user");
    } finally {
      setIsSaving(false);
    }
  };

  const updateBalance = (leaveTypeId: string, newBalance: number) => {
    const balances = formData.leaveBalances || [];
    const existingIndex = balances.findIndex((b: any) => (b.leaveTypeId?._id || b.leaveTypeId) === leaveTypeId);
    
    if (existingIndex >= 0) {
      const updated = [...balances];
      updated[existingIndex] = { ...updated[existingIndex], balance: newBalance };
      setFormData((p: any) => ({ ...p, leaveBalances: updated }));
    } else {
      setFormData((p: any) => ({ 
        ...p, 
        leaveBalances: [...balances, { leaveTypeId, balance: newBalance, used: 0, pending: 0 }] 
      }));
    }
  };

  const getBalance = (leaveTypeId: string) => {
    const balances = formData.leaveBalances || [];
    const bal = balances.find((b: any) => (b.leaveTypeId?._id || b.leaveTypeId) === leaveTypeId);
    return bal?.balance || 0;
  };

  const editingUserLeaveStats = React.useMemo(() => {
    if (!editingUser) {
      return { total: 0, approved: 0, pending: 0, rejected: 0, cancelled: 0 };
    }

    const editingUserId = String(editingUser._id || editingUser.id || "");
    const requests = (leaveRequests || []).filter((request) => {
      const employeeId = String(request.employeeId || request.employee?._id || "");
      return employeeId === editingUserId;
    });

    return {
      total: requests.length,
      approved: requests.filter((request) => request.status === "APPROVED").length,
      pending: requests.filter((request) => request.status === "PENDING" || request.status === "HR_PENDING").length,
      rejected: requests.filter((request) => request.status === "REJECTED").length,
      cancelled: requests.filter((request) => request.status === "CANCELLED").length,
    };
  }, [editingUser, leaveRequests]);

  return (
    <DashboardLayout title="User Management" subtitle="Manage employees, roles, and leave balances" allowedRoles={["HR_ADMIN", "MANAGER"]}>
      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-5 animate-in fade-in duration-300">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Loading users...</p>
        </div>
      )}

      {/* Content - Only show when not loading */}
      {!isLoading && (
        <>
          {/* Header with Create Button */}
          <div className="flex justify-between items-center mb-5">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("active")}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === "active"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                Active Users ({activeUsers.length})
              </button>
              <button
                onClick={() => setActiveTab("pending")}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
                  activeTab === "pending"
                    ? "bg-amber-600 text-white shadow-md"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                <Clock className="w-4 h-4" />
                Pending Approval ({pendingUsers.length})
              </button>
            </div>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleFileUpload} />
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
              >
                <UploadCloud className="w-4 h-4" />
                Import Users
              </button>
              <button
                onClick={startCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-all shadow-md hover:shadow-lg"
              >
                <UserPlus className="w-4 h-4" />
                Create New User
              </button>
            </div>
          </div>

          {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
          <option value="ALL">All Roles</option>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="hr_admin">HR Admin</option>
          <option value="intern">Interns</option>
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
          <option value="ALL">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Summary */}
      {activeTab === "active" && (
        <div className="flex gap-4 mb-5 text-sm flex-wrap">
          {[
            { label: "Total Active", count: activeUsers.length, color: "text-gray-900" },
            { label: "Employees", count: activeUsers.filter(u => roleKey(u.role) === "EMPLOYEE").length, color: "text-green-700" },
            { label: "Interns", count: activeUsers.filter(u => roleKey(u.role) === "INTERN").length, color: "text-cyan-700" },
            { label: "Managers", count: activeUsers.filter(u => roleKey(u.role) === "MANAGER").length, color: "text-blue-700" },
            { label: "On Probation", count: activeUsers.filter(u => u.probationStatus).length, color: "text-amber-700" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl px-4 py-2 border border-gray-100 shadow-sm">
              <span className="text-gray-500">{s.label}: </span>
              <span className={`font-bold ${s.color}`}>{s.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Active Users Table - Using Reusable Component */}
      {activeTab === "active" && (
        <EmployeeDirectoryTable
          employees={transformedEmployees}
          onEdit={(employee) => {
            const originalUser = filtered.find(u => (u._id || u.id) === employee.id);
            if (originalUser) startEdit(originalUser);
          }}
          onDelete={(employee) => handleDelete(employee.id)}
          showLeaveBalances={true}
        />
      )}

      {/* Pending Users Table - Custom Layout for Approval Actions */}
      {activeTab === "pending" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">{filtered.length} pending user{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Employee", "Department", "Requested Role", "Registration Date", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                      <p className="text-sm font-medium">No pending approvals</p>
                      <p className="text-xs mt-1">All registrations have been processed</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u._id || u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(u.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{u.name || 'N/A'}</p>
                            <p className="text-xs text-gray-400">{u.email || 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{u.department || 'N/A'}</p>
                        <p className="text-xs text-gray-400">{u.designation || 'N/A'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[u.role as Role] || 'bg-gray-100 text-gray-700'}`}>{roleLabel(u.role || '')}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleApprove(u._id || u.id || '')}
                            className="flex items-center gap-1.5 text-xs text-white bg-green-600 hover:bg-green-700 font-medium px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button 
                            onClick={() => handleReject(u._id || u.id || '')}
                            className="flex items-center gap-1.5 text-xs text-white bg-red-600 hover:bg-red-700 font-medium px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      <Modal 
        isOpen={isImportModalOpen} 
        onClose={() => { setIsImportModalOpen(false); setImportResults(null); }} 
        title="Import Users via CSV" 
        size="lg"
        footer={
          <button 
            onClick={() => { setIsImportModalOpen(false); setImportResults(null); }} 
            className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <h4 className="font-bold mb-2">CSV Template Format</h4>
            <p className="mb-2">Your CSV file must include a header row with the following exact names:</p>
            <code className="block bg-white p-2 rounded border border-blue-100 font-mono text-xs">
              Name,Email,Password,Role,Department,Designation,Phone,Join Date
            </code>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li><strong>Role</strong> should be 'employee' or 'intern'.</li>
              <li><strong>Join Date</strong> should be in YYYY-MM-DD format.</li>
            </ul>
          </div>

          {!importResults && !isSaving && (
            <div className="flex justify-center mt-6">
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <UploadCloud className="w-5 h-5" />
                Select CSV File
              </button>
            </div>
          )}

          {isSaving && (
            <div className="text-center py-6">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-600 font-medium">Processing CSV...</p>
            </div>
          )}

          {importResults && (
            <div className="space-y-3">
              <h4 className="font-bold text-gray-900 border-b pb-2">Import Summary</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-center">
                  <p className="text-sm text-gray-500">Total Rows</p>
                  <p className="text-2xl font-bold">{importResults.total}</p>
                </div>
                <div className="bg-green-50 border border-green-100 p-3 rounded-lg text-center">
                  <p className="text-sm text-green-700">Success</p>
                  <p className="text-2xl font-bold text-green-700">{importResults.success}</p>
                </div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-center">
                  <p className="text-sm text-red-700">Failed</p>
                  <p className="text-2xl font-bold text-red-700">{importResults.failed}</p>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="mt-4">
                  <p className="font-semibold text-xs text-red-600 mb-2">Errors Logs:</p>
                  <div className="bg-red-50 p-3 rounded-lg max-h-40 overflow-y-auto border border-red-100 space-y-1 text-left">
                    {importResults.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-800 font-mono">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title={`Edit: ${editingUser?.name || 'User'}`} size="xl"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setEditingUser(null)} disabled={isSaving} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2.5 bg-[#1E3A8A] text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }>
        {editingUser && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Full Name", field: "name", type: "text" },
                { label: "Email", field: "email", type: "email" },
                { label: "Phone", field: "phone", type: "tel" },
                { label: "Designation", field: "designation", type: "text" },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
                  <input type={type} value={formData[field] || ""}
                    onChange={e => setFormData((p: any) => ({ ...p, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                <select value={formData.role || 'employee'} onChange={e => setFormData((p: any) => ({ ...p, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
                <option value="intern">Interns</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Join Date</label>
                <input type="date" value={formData.joinDate ? formData.joinDate.slice(0, 10) : ''} onChange={e => setFormData((p: any) => ({ ...p, joinDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Department</label>
                <select value={formData.department || ''} onChange={e => setFormData((p: any) => ({ ...p, department: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
                  {["Engineering", "Marketing", "Design", "Human Resources", "Finance", "Operations", "Sales"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setFormData((p: any) => ({ ...p, isActive: !p.isActive }))} className={`transition-colors ${formData.isActive ? "text-green-600" : "text-gray-300"}`}>
                  {formData.isActive ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
                <span className="text-sm font-medium text-gray-700">Active Account</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setFormData((p: any) => ({ ...p, probationStatus: !p.probationStatus }))} className={`transition-colors ${formData.probationStatus ? "text-amber-500" : "text-gray-300"}`}>
                  {formData.probationStatus ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
                <span className="text-sm font-medium text-gray-700">On Probation</span>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-2">Leave Request Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Applied", value: editingUserLeaveStats.total, color: "text-gray-900" },
                  { label: "Approved", value: editingUserLeaveStats.approved, color: "text-green-700" },
                  { label: "Pending", value: editingUserLeaveStats.pending, color: "text-amber-700" },
                  { label: "Rejected", value: editingUserLeaveStats.rejected, color: "text-red-700" },
                  { label: "Cancelled", value: editingUserLeaveStats.cancelled, color: "text-slate-700" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                    <p className="text-xs font-medium text-gray-500">{item.label}</p>
                    <p className={`mt-1 text-lg font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-2">Override Leave Balances</h4>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for Balance Adjustment *</label>
                <input 
                  type="text" 
                  value={balanceReason} 
                  onChange={e => setBalanceReason(e.target.value)}
                  placeholder="Required if changing balances..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {leaveTypes.map(lt => (
                  <div key={lt._id || lt.id}>
                    <label className="block text-xs font-semibold mb-1" style={{ color: lt.color }}>{lt.code} — {lt.name}</label>
                    <input 
                      type="number" 
                      min={-365} 
                      max={365} 
                      step={0.5}
                      value={getBalance(lt._id || lt.id || '')}
                      onChange={e => updateBalance(lt._id || lt.id || '', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Create User Modal */}
      <Modal 
        isOpen={isCreating} 
        onClose={() => setIsCreating(false)} 
        title="Create New User" 
        size="xl"
        footer={
          <div className="flex gap-3">
            <button 
              onClick={() => setIsCreating(false)} 
              disabled={isSaving} 
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreate} 
              disabled={isSaving} 
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
              <input 
                type="text" 
                value={formData.name || ""}
                onChange={e => setFormData((p: any) => ({ ...p, name: e.target.value }))}
                placeholder="John Doe"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email *</label>
              <input 
                type="email" 
                value={formData.email || ""}
                onChange={e => setFormData((p: any) => ({ ...p, email: e.target.value }))}
                placeholder="john@example.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Password *</label>
              <input 
                type="password" 
                value={formData.password || ""}
                onChange={e => setFormData((p: any) => ({ ...p, password: e.target.value }))}
                placeholder="Min 6 characters"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
              <input 
                type="tel" 
                value={formData.phone || ""}
                onChange={e => setFormData((p: any) => ({ ...p, phone: e.target.value }))}
                placeholder="+1234567890"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Designation</label>
              <input 
                type="text" 
                value={formData.designation || ""}
                onChange={e => setFormData((p: any) => ({ ...p, designation: e.target.value }))}
                placeholder="Software Engineer"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Role *</label>
              <select 
                value={formData.role || 'employee'} 
                onChange={e => setFormData((p: any) => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="employee">Employee</option>
                <option value="intern">Interns</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Join Date *</label>
              <input 
                type="date" 
                value={formData.joinDate ? formData.joinDate.slice(0, 10) : ''}
                onChange={e => setFormData((p: any) => ({ ...p, joinDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Department *</label>
              <select 
                value={formData.department || 'Engineering'} 
                onChange={e => setFormData((p: any) => ({ ...p, department: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
              >
                {["Engineering", "Marketing", "Design", "Human Resources", "Finance", "Operations", "Sales"].map(d => 
                  <option key={d} value={d}>{d}</option>
                )}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setFormData((p: any) => ({ ...p, isActive: !p.isActive }))} 
                className={`transition-colors ${formData.isActive ? "text-green-600" : "text-gray-300"}`}
              >
                {formData.isActive ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
              <span className="text-sm font-medium text-gray-700">Active Account</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setFormData((p: any) => ({ ...p, probationStatus: !p.probationStatus }))} 
                className={`transition-colors ${formData.probationStatus ? "text-amber-500" : "text-gray-300"}`}
              >
                {formData.probationStatus ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
              <span className="text-sm font-medium text-gray-700">On Probation</span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Leave balances will be automatically initialized based on the configured leave types. 
              The user will receive a welcome notification and can login immediately.
            </p>
          </div>
        </div>
      </Modal>

      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-3">Department Change Requests</h3>
        <div className="space-y-2">
          {departmentRequests.filter((r) => r.status === "PENDING").slice(0, 8).map((r) => (
            <div key={r._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="text-sm">
                <p className="font-semibold text-gray-900">{r.userId?.name}</p>
                <p className="text-xs text-gray-500">{r.oldDepartment} to {r.newDepartment}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await adminService.confirmDepartmentChange(r._id);
                    const refreshed = await adminService.getDepartmentChangeRequests();
                    setDepartmentRequests(refreshed.data.requests || []);
                    await fetchUsers();
                  }}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg"
                >
                  Confirm
                </button>
                <button
                  onClick={async () => {
                    await adminService.rejectDepartmentChange(r._id);
                    const refreshed = await adminService.getDepartmentChangeRequests();
                    setDepartmentRequests(refreshed.data.requests || []);
                  }}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {departmentRequests.filter((r) => r.status === "PENDING").length === 0 && (
            <p className="text-sm text-gray-500">No pending department change requests.</p>
          )}
        </div>
      </div>
        </>
      )}
    </DashboardLayout>
  );
}




