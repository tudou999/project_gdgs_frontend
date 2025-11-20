import { apiClient, rawApiClient } from "./client";

export const fileAPI = {
  // 获取文件列表
  getFolderList(folderId) {
    return apiClient.get("/file/list", {
      params: {
        id: folderId,
      },
    });
  },

  // 获取文件信息
  getInformation(id) {
    return apiClient.get(`/file/${id}`);
  },

  // 创建新文件夹
  postCreateFolder(id, name) {
    return apiClient.post("/file/folder", {
      parentId: id,
      name: name,
    });
  },

  // 重命名文件/文件夹
  putRenameFile(id, name) {
    return apiClient.put("/file/rename", {
      id: id,
      newName: name,
    });
  },

  // 删除文件/文件夹
  deleteDeleteFile(id) {
    return apiClient.delete(`/file/${id}`);
  },

  // 下载文件
  getDownloadFile(id) {
    return rawApiClient.get("/file/download", {
      params: {
        id: id,
      },
      responseType: "blob",
    });
  },

  // 上传文件
  postUploadFile(id, file) {
    return rawApiClient.post("/file/upload", file, {
      params: {
        "parent-id": id,
      },
    });
  },
};
