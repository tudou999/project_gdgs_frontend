import { useUserStore } from "../stores/user.ts";

const BASE_URL = 'http://localhost/api/v1'
const FILE_BASE_URL = `${BASE_URL}/file`
const userStore = useUserStore();

export const fileAPI = {
  async getFileList() {
    const response = await fetch(`${FILE_BASE_URL}/list`, {
      method: 'GET',
      headers: {
        'Authorization': userStore.token
      }
    })
    return response.json()
  },

  async getFolderList(folderId) {
    const url = new URL(`${FILE_BASE_URL}/list`);
    url.searchParams.append('id', folderId);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': userStore.token
      }
    })
    return response.json()
  }
}