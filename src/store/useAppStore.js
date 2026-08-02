import { create } from "zustand"

export const useAppStore = create((set) => ({
  // Screen state
  currentScreen: localStorage.getItem("currentScreen") || "upload",
  setCurrentScreen: (screen) => {
    set({ currentScreen: screen })
    localStorage.setItem("currentScreen", screen)
  },

  // User context
  userContext: '',
  setUserContext: (ctx) => set({ userContext: ctx }),

  // Upload state
  uploadedFiles: [],
  setUploadedFiles: (files) => set({ uploadedFiles: files }),

  // Loading states
  isLoadingSchema: false,
  setIsLoadingSchema: (loading) => set({ isLoadingSchema: loading }),

  isLoadingQuality: false,
  setIsLoadingQuality: (loading) => set({ isLoadingQuality: loading }),

  // Error state
  error: null,
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // Schema data
  schema: null,
  setSchema: (schema) => set({ schema }),

  // Quality data
  qualityData: null,
  setQualityData: (data) => set({ qualityData: data }),
}))
