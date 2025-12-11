import type { ResType } from "../interface/Tgeneral.ts";

export const useGetCode = (res: ResType): boolean => {
  return res.code === 200;
};
