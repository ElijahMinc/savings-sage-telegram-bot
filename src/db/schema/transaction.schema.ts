import { ITransactionRecord } from "@/types/app-context.interface";

export type ITransactionRecordStored = Omit<ITransactionRecord, "category"> & {
  category?: string;
};
