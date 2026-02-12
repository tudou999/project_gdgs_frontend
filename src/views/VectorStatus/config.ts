// 向量状态页相关配置与类型

export interface VectorStatusItem {
  id: string;
  name: string;
  size: string;
  storageKey: string;
  status: string;
  retryCount: number;
  created: string;
  updated: string;
  errorMsg: string | null;
}

export interface VectorStatusResponse {
  records: VectorStatusItem[];
  total: string;
  size: string;
  current: string;
  pages: string;
}

export const VECTOR_STATUS_PAGE_SIZE_DEFAULT = 10;
export const VECTOR_STATUS_PAGE_SIZE_OPTIONS = [10, 20, 50];
export const VECTOR_STATUS_SEARCH_DEBOUNCE = 500;

export const buildVectorStatusParams = (options: {
  pageNum: number;
  pageSize: number;
  keyword?: string;
}) => {
  const { pageNum, pageSize, keyword } = options;
  const params: Record<string, unknown> = {
    pageNum,
    pageSize,
  };

  const trimmed = keyword?.trim();
  if (trimmed) {
    params.keyword = trimmed;
  }

  return params;
};
