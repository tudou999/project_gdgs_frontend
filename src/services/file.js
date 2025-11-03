import { useUserStore } from "../stores/user.ts";

const BASE_URL = 'http://localhost/api/v1'
const FILE_BASE_URL = `${BASE_URL}/file`
const userStore = useUserStore();

export const fileAPI = {
  // 获取文件列表
  async getFolderList(folderId) {
    const url = new URL(`${FILE_BASE_URL}/list`);
    if(folderId !== null) {
      url.searchParams.append('id', folderId);
    }
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
  },

  // 创建新文件夹
  async postCreateFolder(id, name) {
    const response = await fetch(`${FILE_BASE_URL}/folder`, {
      method: 'POST',
      headers: {
        'Authorization': userStore.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parentId: id,
        name: name
      })
    })
    return response.json()
  },

  // 重命名文件/文件夹
  async putRenameFile(id, name) {
    const response = await fetch(`${FILE_BASE_URL}/rename`, {
      method: 'PUT',
      headers: {
        'Authorization': userStore.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: id,
        newName: name
      })
    });
    return response.json()
  }
}