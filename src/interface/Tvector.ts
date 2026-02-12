/** 获取向量状态列表的查询参数，不传 status 即全部查询 */
export interface VectorStatusSearchParams {
  /** 按状态筛选，不传则查询全部 */
  status?: string;
  /** 按文件名模糊搜索，不传则不按名称筛选 */
  name?: string;
  pageNum?: number;
  pageSize?: number;
}
