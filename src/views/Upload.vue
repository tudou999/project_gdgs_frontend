<template>
  <el-container>
    <!-- 返回文件夹按钮 -->
    <el-header>
      <el-button
        style="align-items: center"
        type="primary"
        size="large"
        @click="goBackToFileSystem()"
        >返回文件夹</el-button
      >
    </el-header>

    <!-- 上传组件 -->
    <el-upload
      class="upload-demo"
      drag
      action=""
      :http-request="uploadFile"
      multiple
    >
      <!-- 上传图标及操作提示 -->
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">拖拽文件至此处或 <em>点击上传文件</em></div>

      <!-- 文件大小提示 -->
      <template #tip>
        <div class="el-upload__tip">文件大小在100MB内</div>
      </template>
    </el-upload>
  </el-container>
</template>

<script setup>
import { ElMessage } from "element-plus";
import { UploadFilled } from "@element-plus/icons-vue";
import { useRoute, useRouter } from "vue-router";
import { fileAPI } from "../services/file";

const route = useRoute();
const router = useRouter();

async function uploadFile(options) {
  const { file, onSuccess, onError, onProgress } = options;

  const folderIdStr = route.query.folderId;
  const lastFolderId = folderIdStr ? folderIdStr.split(",").pop() : null;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const responseJson = await fileAPI.postUploadFile(
      lastFolderId,
      formData,
      (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress({ percent });
        }
      },
    );
    if (responseJson.data.code === 200) {
      ElMessage.success("上传成功！");
      if (onSuccess) {
        onSuccess(responseJson, file);
      }
    } else {
      ElMessage.error("上传失败：" + (responseJson.data.msg || "未知错误"));
      if (onError) {
        onError(new Error(responseJson.data.msg || "上传失败"));
      }
    }
  } catch (error) {
    ElMessage.error("上传异常，请稍后重试");
    if (onError) {
      onError(error);
    }
  }
}

// 返回文件夹
async function goBackToFileSystem() {
  const id = route.query.folderId;
  const query = id ? { id } : {};
  await router.push({
    name: "FileSystem",
    query,
  });
}
</script>

<style scoped lang="scss">
.el-header {
  display: flex;
  align-items: center;
}
</style>
