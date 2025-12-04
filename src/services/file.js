import { apiClient, rawApiClient } from "./client";

export const fileAPI = {
  // 获取文件列表
  getFolderList(folderId) {
    return apiClient.get("/files", {
      params: {
        id: folderId,
      },
    });
  },

  // 获取文件原始信息
  getRawInformation(id) {
    return apiClient.get(`/files/${id}`);
  },

  // 获取文件信息
  getInformation(id) {
    return apiClient.get(`/files/${id}/info`);
  },

  // 创建新文件夹
  postCreateFolder(id, name) {
    return apiClient.post("/files/folder", {
      parentId: id,
      name: name,
    });
  },

  // 重命名文件/文件夹
  putRenameFile(id, name) {
    return apiClient.put(`/files/${id}/rename`, {
      newName: name,
    });
  },

  // 删除文件/文件夹
  deleteDeleteFile(id) {
    return apiClient.delete(`/files/${id}`);
  },

  // 下载文件
  getDownloadFile(id) {
    return rawApiClient.get(`/files/${id}/download`, {
      responseType: "blob",
    });
  },

  // 上传文件
  postUploadFile(id, file) {
    return rawApiClient.post("/files/upload", file, {
      params: {
        "parent-id": id,
      },
    });
  },

  // 上传文件信息
  postUploadFileInfo(fileMetadataId, info) {
    return apiClient.post("/files/info", {
      file_metadata_id: fileMetadataId,
      projectName: info.projectName,
      projectStartDate: info.projectStartDate,
      projectDuration: info.projectDuration,
      projectManager: info.projectManager,
      projectManagerSecond: info.projectManagerSecond,
      projectLocation: info.projectLocation,
      projectPartner: info.projectPartner,
    });
  },
};
