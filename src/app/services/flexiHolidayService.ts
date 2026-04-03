import api from "./api";

export interface FlexiHolidayItem {
  title: string;
  date: string;
  day: string;
  active?: boolean;
}

export const flexiHolidayService = {
  list: async (params?: { start?: string; end?: string; includeInactive?: boolean }) => {
    const response = await api.get("/flexi-holidays", { params });
    return response.data as { success: boolean; items: FlexiHolidayItem[] };
  },

  upsert: async (payload: { title: string; date: string; day?: string; active?: boolean }) => {
    const response = await api.post("/flexi-holidays", payload);
    return response.data as { success: boolean; item: FlexiHolidayItem };
  },

  update: async (date: string, payload: { title: string; date: string; day?: string; active?: boolean }) => {
    const response = await api.put(`/flexi-holidays/${date}`, payload);
    return response.data as { success: boolean; item: FlexiHolidayItem };
  },

  remove: async (date: string) => {
    const response = await api.delete(`/flexi-holidays/${date}`);
    return response.data as { success: boolean; message: string };
  },
};
