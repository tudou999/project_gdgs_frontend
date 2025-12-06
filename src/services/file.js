import { apiClient, rawApiClient } from "./client";

const FILE_API_BASE_URL = "/files";

export const fileAPI = {
  // 获取文件列表
  getFolderList(folderId) {
    return apiClient.get(`${FILE_API_BASE_URL}`, {
      params: {
        id: folderId,
      },
    });
  },

  // 获取文件原始信息
  getRawInformation(id) {
    return apiClient.get(`${FILE_API_BASE_URL}/${id}`);
  },

  // 获取文件信息
  getInformation(id) {
    return apiClient.get(`${FILE_API_BASE_URL}/${id}/info`);
  },

  // 创建新文件夹
  postCreateFolder(id, name) {
    return apiClient.post(`${FILE_API_BASE_URL}/folder`, {
      parentId: id,
      name: name,
    });
  },

  // 重命名文件/文件夹
  putRenameFile(id, name) {
    return apiClient.put(`${FILE_API_BASE_URL}/${id}/rename`, {
      newName: name,
    });
  },

  // 删除文件/文件夹
  deleteDeleteFile(id) {
    return apiClient.delete(`${FILE_API_BASE_URL}/${id}`);
  },

  // 下载文件（支持进度回调）
  getDownloadFile(id, onProgress) {
    return rawApiClient.get(`${FILE_API_BASE_URL}/${id}/content`, {
      responseType: "blob",
      onDownloadProgress: onProgress,
    });
  },

  // 上传文件
  postUploadFile(id, file, onProgress) {
    return rawApiClient.post(`${FILE_API_BASE_URL}/upload`, file, {
      params: {
        "parent-id": id,
      },
      onUploadProgress: onProgress,
    });
  },

  // 上传文件信息
  postUploadFileInfo(fileMetadataId, info) {
    return apiClient.post(`${FILE_API_BASE_URL}/info`, {
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

  // 移动文件至文件夹
  putMoveFile(id, targetFolderId) {
    return apiClient.put(`${FILE_API_BASE_URL}/${id}/move`, {
      id: id,
      newParentId: targetFolderId,
    });
  },
};
