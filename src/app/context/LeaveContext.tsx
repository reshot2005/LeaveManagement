import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { leaveService } from "../services/leaveService";
import { leaveTypeService } from "../services/leaveTypeService";
import { userService } from "../services/userService";

export interface LeaveRequest {
  _id: string;
  id: string;
  employee: any;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  leaveType: any;
  leaveTypeId?: string;
  leaveTypeName?: string;
  leaveTypeCode?: string;
  leaveTypeColor?: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  halfDay: boolean;
  halfDaySession?: string;
  reason: string;
  status: 'PENDING' | 'HR_PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvalHistory: any[];
  comments?: string;
  createdAt: string;
  updatedAt?: string;
  attachmentUrl?: string;
}

export interface LeaveType {
  _id: string;
  id: string;
  name: string;
  code: string;
  color: string;
  description?: string;
  accrualType: string;
  accrualRate: number;
  accrualPerMonth?: number;
  yearlyTotal?: number;
  carryForwardLimit: number;
  allowNegativeBalance: boolean;
  applicableDuringProbation: boolean;
  requiresDocument?: boolean;
  maxConsecutiveDays: number;
  isActive: boolean;
}

interface User {
  _id: string;
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  designation?: string;
  leaveBalances: any[];
  isActive: boolean;
  probationStatus?: boolean;
  joinDate?: string;
  createdAt?: string;
  managerId?: string;
  avatar?: string;
}

interface LeaveContextType {
  leaveRequests: LeaveRequest[];
  leaveTypes: LeaveType[];
  allUsers: User[];
  dashboardStats: any;
  isLoading: boolean;
  submitLeaveRequest: (data: any) => Promise<{ success: boolean; message: string }>;
  approveLeave: (requestId: string, comment?: string, hrOverride?: boolean) => Promise<{ success: boolean; message: string }>;
  rejectLeave: (requestId: string, comment: string) => Promise<{ success: boolean; message: string }>;
  cancelLeave: (requestId: string, reason?: string) => Promise<{ success: boolean; message: string }>;
  fetchLeaveRequests: () => Promise<void>;
  fetchLeaveTypes: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  updateLeaveType: (id: string, data: any) => Promise<{ success: boolean; message: string }>;
  updateUser: (id: string, data: any) => Promise<{ success: boolean; message: string }>;
  getUserById: (id: string) => User | undefined;
  getRequestById: (id: string) => LeaveRequest | undefined;
}

const LeaveContext = createContext<LeaveContextType | undefined>(undefined);
const roleKey = (role?: string) => String(role || "").toUpperCase();

export const LeaveProvider = ({ children }: { children: ReactNode }) => {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true); // Start with true
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const fetchLeaveRequests = async () => {
    try {
      // Fetch based on user role - get from sessionStorage
      const user = JSON.parse(sessionStorage.getItem('user') || '{}');

      let response;
      if (roleKey(user.role) === 'HR_ADMIN' || roleKey(user.role) === 'MANAGER') {
        // HR and Manager get all leaves
        response = await leaveService.getAllLeaves();
      } else {
        // Employee gets own leaves
        response = await leaveService.getMyLeaves();
      }

      // Transform API data to match component expectations
      const transformedLeaves = (response.data.leaves || []).map((leave: any) => ({
        ...leave,
        id: leave._id || leave.id,
        employeeId: leave.employee?._id || leave.employeeId,
        employeeName: leave.employee?.name || leave.employeeName || '',
        department: leave.employee?.department || leave.department || '',
        leaveTypeId: leave.leaveType?._id || leave.leaveTypeId,
        leaveTypeName: leave.leaveType?.name || leave.leaveTypeName || '',
        leaveTypeCode: leave.leaveType?.code || leave.leaveTypeCode || '',
        leaveTypeColor: leave.leaveType?.color || leave.leaveTypeColor || '#3B82F6',
        halfDaySession: leave.halfDaySession || '',
        updatedAt: leave.updatedAt || leave.createdAt,
      }));

      setLeaveRequests(transformedLeaves);
    } catch (error) {
      console.error("Failed to fetch leave requests:", error);
      setLeaveRequests([]); // Set empty array on error
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      const response = await leaveTypeService.getAllLeaveTypes(true);
      // Transform API data
      const transformedTypes = (response.data.leaveTypes || []).map((lt: any) => ({
        ...lt,
        id: lt._id || lt.id,
        code: String(lt.code || "").toUpperCase(),
        name: lt.name || "",
        color: lt.color || "#3B82F6",
        description: lt.description || "",
        accrualType: String(lt.accrualType || "").toUpperCase() || "YEARLY",
        accrualRate: Number(lt.accrualRate ?? lt.accrualPerMonth ?? lt.accrual ?? 0),
        accrualPerMonth: Number(lt.accrualPerMonth ?? (String(lt.accrualType || "").toUpperCase() === "MONTHLY" ? lt.accrualRate : 0) ?? 0),
        yearlyTotal: Number(lt.yearlyTotal ?? lt.accrualPerYear ?? 0),
        carryForwardLimit: Number(lt.carryForwardLimit ?? 0),
        maxConsecutiveDays: Number(lt.maxConsecutiveDays ?? lt.maxConsecutive ?? 30),
        allowNegativeBalance: lt.allowNegativeBalance !== undefined ? Boolean(lt.allowNegativeBalance) : false,
        applicableDuringProbation: lt.applicableDuringProbation !== undefined ? Boolean(lt.applicableDuringProbation) : true,
        isActive: lt.isActive !== undefined ? Boolean(lt.isActive) : lt.active !== undefined ? Boolean(lt.active) : true,
      }));
      setLeaveTypes(transformedTypes);
    } catch (error) {
      console.error("Failed to fetch leave types:", error);
      setLeaveTypes([]); // Set empty array on error
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await userService.getAllUsers();
      // Transform API data
      const transformedUsers = (response.data.users || []).map((u: any) => ({
        ...u,
        id: u._id || u.id,
      }));
      setAllUsers(transformedUsers);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      setAllUsers([]); // Set empty array on error
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const response = await leaveService.getDashboardStats();
      setDashboardStats(response.data.stats || {});
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    }
  };

  useEffect(() => {
    // Only fetch data if user is authenticated
    const user = sessionStorage.getItem('user');
    if (user) {
      const loadInitialData = async () => {
        setIsLoading(true);
        try {
          const parsedUser = JSON.parse(user);

          const loadingPromises = [
            fetchLeaveTypes(),
            fetchLeaveRequests(),
            fetchDashboardStats(),
          ];

          if (roleKey(parsedUser.role) === 'HR_ADMIN' || roleKey(parsedUser.role) === 'MANAGER') {
            loadingPromises.push(fetchUsers());
          }

          // Await all initial data fetches so components show skeletons correctly
          await Promise.all(loadingPromises);

        } catch (error) {
          console.error("LeaveContext: Load failed:", error);
        } finally {
          setIsLoading(false);
          setInitialLoadComplete(true);
        }
      };

      loadInitialData();
    } else {
      setIsLoading(false);
      setInitialLoadComplete(true);
    }
  }, []);

  const submitLeaveRequest = async (data: any): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await leaveService.applyLeave(data);
      await Promise.all([fetchLeaveRequests(), fetchDashboardStats()]);
      // Trigger balance refresh in AuthContext
      window.dispatchEvent(new CustomEvent('refreshBalances'));
      // Broadcast refresh event for all components
      window.dispatchEvent(new CustomEvent('leaveDataUpdated'));
      const emailNote = response?.data?.notificationsQueued ? " Email sent to manager & HR." : "";
      return { success: true, message: `${response?.message || "Leave request submitted successfully!"}${emailNote}` };
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to submit leave request.";
      return { success: false, message };
    }
  };

  const approveLeave = async (requestId: string, comment?: string, hrOverride?: boolean): Promise<{ success: boolean; message: string }> => {
    try {
      console.log("LeaveContext - Approving leave:", { requestId, comment, hrOverride });
      const response = await leaveService.approveLeave(requestId, comment, hrOverride);
      console.log("LeaveContext - Approve response:", response);

      // Force immediate refresh of all data
      await Promise.all([
        fetchLeaveRequests(),
        fetchDashboardStats(),
        fetchUsers() // Refresh users to get updated balances
      ]);

      // Trigger balance refresh in AuthContext
      window.dispatchEvent(new CustomEvent('refreshBalances'));

      // Broadcast refresh event for all components
      window.dispatchEvent(new CustomEvent('leaveDataUpdated'));

      return { success: true, message: "Leave request approved successfully!" };
    } catch (error: any) {
      console.error("LeaveContext - Approve error:", error);
      const message = error.response?.data?.message || "Failed to approve leave request.";
      return { success: false, message };
    }
  };

  const rejectLeave = async (requestId: string, comment: string): Promise<{ success: boolean; message: string }> => {
    try {
      console.log("LeaveContext - Rejecting leave:", { requestId, comment });
      const response = await leaveService.rejectLeave(requestId, comment);
      console.log("LeaveContext - Reject response:", response);

      // Force immediate refresh of all data
      await Promise.all([
        fetchLeaveRequests(),
        fetchDashboardStats(),
        fetchUsers() // Refresh users to get updated balances
      ]);

      // Trigger balance refresh in AuthContext
      window.dispatchEvent(new CustomEvent('refreshBalances'));

      // Broadcast refresh event for all components
      window.dispatchEvent(new CustomEvent('leaveDataUpdated'));

      return { success: true, message: "Leave request rejected." };
    } catch (error: any) {
      console.error("LeaveContext - Reject error:", error);
      const message = error.response?.data?.message || "Failed to reject leave request.";
      return { success: false, message };
    }
  };

  const cancelLeave = async (requestId: string, reason?: string): Promise<{ success: boolean; message: string }> => {
    try {
      await leaveService.cancelLeave(requestId, reason);
      await Promise.all([fetchLeaveRequests(), fetchDashboardStats()]);
      // Trigger balance refresh in AuthContext
      window.dispatchEvent(new CustomEvent('refreshBalances'));
      // Broadcast refresh event for all components
      window.dispatchEvent(new CustomEvent('leaveDataUpdated'));
      return { success: true, message: "Leave request cancelled." };
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to cancel leave request.";
      return { success: false, message };
    }
  };

  const updateLeaveType = async (id: string, data: any): Promise<{ success: boolean; message: string }> => {
    try {
      await leaveTypeService.updateLeaveType(id, data);
      await Promise.all([fetchLeaveTypes(), fetchDashboardStats()]);
      window.dispatchEvent(new CustomEvent('leaveDataUpdated'));
      window.dispatchEvent(new CustomEvent('refreshBalances'));
      return { success: true, message: "Leave type updated successfully!" };
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to update leave type.";
      return { success: false, message };
    }
  };

  const updateUser = async (id: string, data: any): Promise<{ success: boolean; message: string }> => {
    try {
      await userService.updateUser(id, data);
      // Refresh users without setting global loading state
      await fetchUsers();
      return { success: true, message: "User updated successfully!" };
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to update user.";
      return { success: false, message };
    }
  };

  // Separate function for refreshing all data (used after updates)
  const refreshAllData = async () => {
    try {
      setIsLoading(true);
      const user = JSON.parse(sessionStorage.getItem('user') || '{}');

      const promises = [
        fetchLeaveTypes(),
        fetchLeaveRequests(),
        fetchDashboardStats(),
      ];

      if (roleKey(user.role) === 'HR_ADMIN' || roleKey(user.role) === 'MANAGER') {
        promises.push(fetchUsers());
      }

      await Promise.all(promises);
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserById = (id: string) => allUsers.find((u) => u._id === id);
  const getRequestById = (id: string) => leaveRequests.find((r) => r._id === id);

  return (
    <LeaveContext.Provider
      value={{
        leaveRequests,
        leaveTypes,
        allUsers,
        dashboardStats,
        isLoading: isLoading || !initialLoadComplete,
        submitLeaveRequest,
        approveLeave,
        rejectLeave,
        cancelLeave,
        fetchLeaveRequests,
        fetchLeaveTypes,
        fetchUsers,
        fetchDashboardStats,
        refreshAllData,
        updateLeaveType,
        updateUser,
        getUserById,
        getRequestById,
      }}
    >
      {children}
    </LeaveContext.Provider>
  );
};

export const useLeave = (): LeaveContextType => {
  const ctx = useContext(LeaveContext);
  if (!ctx) throw new Error("useLeave must be used inside LeaveProvider");
  return ctx;
};
