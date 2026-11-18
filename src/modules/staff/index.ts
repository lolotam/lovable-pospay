// Public API of the staff module. Other modules import only from this file.
export { phoneProofSchema } from "./phone.contracts";
export {
  getPhoneManagementFn,
  startBindingFn,
  finishBindingFn,
  unbindPhoneFn,
} from "./functions/phone.functions";
export type { PhoneManagementDto, PhoneStaffOption } from "./phone.contracts";

export { CompanyScope } from "./ui/company-scope";
