import { useUserStore } from "../stores/user.ts";

const BASE_URL = 'http://localhost/api/v1'
const FILE_BASE_URL = `${BASE_URL}/file`
const userStore = useUserStore();

export const fileAPI = {
  // 获取初始文件列表
  async getFileList() {
    const response = await fetch(`${FILE_BASE_URL}/list`, {
      headers: {
        'Authorization': userStore.token
      }
    })
    return response.json()
  },

  // 获取新文件列表
  async getFolderList(folderId) {
    const url = new URL(`${FILE_BASE_URL}/list`);
    url.searchParams.append('id', folderId);

    const response = await fetch(url, {
      headers: {
        'Authorization': userStore.token
      }
    })
    return response.json()
  },

  // 获取文件信息
  async getInformation(id) {
    const response = await fetch(`${FILE_BASE_URL}/${id}`, {
      headers: {
        'Authorization': userStore.token
      }
    })
    return response.json()
  }
}