import React from "react";
import { Pencil, Trash2 } from "lucide-react";

/**
 * Employee Directory Table Component
 * 
 * A reusable, clean table component for displaying employee information
 * with dynamic data binding and no hardcoded values.
 */

// Type definitions for component props
export interface EmployeeData {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  role: "EMPLOYEE" | "INTERN" | "MANAGER" | "HR_ADMIN";
  joinDate: string;
  isActive: boolean;
  probationStatus?: boolean;
  leaveBalances?: LeaveBalance[];
}

export interface LeaveBalance {
  code: string;
  name: string;
  balance: number;
  color: string;
}

interface EmployeeDirectoryTableProps {
  employees: EmployeeData[];
  onEdit?: (employee: EmployeeData) => void;
  onDelete?: (employee: EmployeeData) => void;
  showLeaveBalances?: boolean;
  className?: string;
}

// Role badge styling configuration
const roleStyles = {
  EMPLOYEE: "bg-green-100 text-green-700",
  INTERN: "bg-cyan-100 text-cyan-700",
  MANAGER: "bg-blue-100 text-blue-700",
  HR_ADMIN: "bg-purple-100 text-purple-700",
};

// Helper function to get initials from name
const getInitials = (name: string): string => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

// Helper function to format date
const formatDate = (dateString: string): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
};

export const EmployeeDirectoryTable: React.FC<EmployeeDirectoryTableProps> = ({
  employees,
  onEdit,
  onDelete,
  showLeaveBalances = true,
  className = "",
}) => {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Table Header */}
      <div className="px-5 py-3.5 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">
          {employees.length} employee{employees.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                Employee
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                Department
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                Join Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              {showLeaveBalances && (
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Earned Leave
                </th>
              )}
              {showLeaveBalances && (
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Sick Leave
                </th>
              )}
              {showLeaveBalances && (
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Flexi Leave
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {employees.length === 0 ? (
              <tr>
                <td
                  colSpan={showLeaveBalances ? 9 : 6}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  <p className="text-sm font-medium">No employees found</p>
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr
                  key={employee.id}
                  className="hover:bg-gray-50 transition-all duration-200"
                >
                  {/* User Identity Column */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Profile Avatar with Initials */}
                      <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 transition-transform duration-200 hover:scale-110">
                        {getInitials(employee.name)}
                      </div>
                      {/* Name and Email */}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {employee.name || "[Full Name]"}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {employee.email || "[email@domain.com]"}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Job Details Column */}
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700 font-medium">
                      {employee.department || "[Department Name]"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {employee.designation || "[Job Title]"}
                    </p>
                  </td>

                  {/* Role Classification Column */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full transition-all duration-200 hover:scale-105 ${
                        roleStyles[employee.role] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {employee.role || "EMPLOYEE"}
                    </span>
                  </td>

                  {/* Joining Date Column */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500">
                      {formatDate(employee.joinDate)}
                    </span>
                  </td>

                  {/* Availability Status Column */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full w-fit transition-all duration-200 ${
                          employee.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {employee.isActive ? "Active" : "Inactive"}
                      </span>
                      {employee.probationStatus && (
                        <span className="inline-flex items-center text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium w-fit">
                          Probation
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Leave Entitlements Column */}
                  {showLeaveBalances && (
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-blue-700">
                        {employee.leaveBalances?.find((b) => b.code === "EL")?.balance ?? 0}
                      </span>
                    </td>
                  )}

                  {showLeaveBalances && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-sm font-bold text-red-600">
                          {employee.leaveBalances?.find((b) => b.code === "SL")?.balance ?? 0}
                        </span>
                      </div>
                    </td>
                  )}

                  {showLeaveBalances && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-sm font-bold text-violet-700">
                          {employee.leaveBalances?.find((b) => b.code === "FLEXI")?.balance ?? 0}
                        </span>
                      </div>
                    </td>
                  )}

                  {/* Action Column */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(employee)}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-all duration-200 hover:scale-105"
                          aria-label={`Edit ${employee.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(employee)}
                          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-all duration-200 hover:scale-105"
                          aria-label={`Delete ${employee.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeDirectoryTable;
