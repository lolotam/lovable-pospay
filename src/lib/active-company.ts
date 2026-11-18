import { createContext, useContext } from "react";

/**
 * الشركة النشطة في مساحة العمل الحالية: `undefined` خارج المناطق، و`null` لمساحة المنصة.
 * الصفحات اللي جوه منطقة لازم تستخدم شركة المساحة النشطة بدل اختيار مستقل.
 */
const ActiveCompanyContext = createContext<string | null | undefined>(undefined);

export const ActiveCompanyProvider = ActiveCompanyContext.Provider;

export function useActiveCompany(): string | null | undefined {
  return useContext(ActiveCompanyContext);
}
