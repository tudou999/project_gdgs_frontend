import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { useUserStore } from "../stores/user";
import { ElMessage } from "element-plus";

const BASE_URL = "/api/v1";

// 添加 token
const addAuthHeader = (
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig => {
  const { token } = useUserStore();
  if (token) {
    (config.headers as any).Authorization = token;
  }
  return config;
};

// 统一错误处理
const handleResponseError = (error: AxiosError | Error) => {
  // 主动取消的请求不提示错误
  if (axios.isCancel(error)) {
    return Promise.reject(error);
  }
  const response = (error as AxiosError).response;
  if (response && response.status !== 200) {
    ElMessage.warning("网络错误！请联系管理员");
  }
  return Promise.reject(error);
};

// data客户端
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// 原始客户端
const rawApiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
});

// 请求拦截器
apiClient.interceptors.request.use(addAuthHeader, handleResponseError);
rawApiClient.interceptors.request.use(addAuthHeader, handleResponseError);

// 响应拦截器
apiClient.interceptors.response.use(
  (res: AxiosResponse) => res.data,
  handleResponseError,
);
rawApiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  handleResponseError,
);

export { apiClient, rawApiClient };
