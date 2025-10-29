<script setup>
import {ElMessage} from "element-plus";

defineOptions({name: "Test3"})

import { onMounted, ref } from "vue";
import { fileAPI } from "../services/file";

const fileList = ref([])

onMounted(() => {
  loadChatHistory()
})

const loadChatHistory = async () => {
  try {
    const oriFileList = await fileAPI.getFileList()
    fileList.value = oriFileList || []
  }
  catch (error){
    ElMessage.warning('加载失败！请联系管理员')
  }
}

const gotoFolder = async(id) => {
  try {
    const newFileList = await fileAPI.getFolderList(id)
    fileList.value = newFileList || []
  }
  catch (error){
    ElMessage.warning('加载失败！请联系管理员')
  }
}

</script>

<template>
  <el-container>
    <el-main>
      <div
        v-for="file in fileList"
        :key="file.id"
        class="file-item"
      >
        <!-- 如果是文件夹，用 button；否则用普通 span -->
        <button
            v-if="file.folder"
            class="folder-button"
            @click="gotoFolder(file.id)"
        >
          {{ file.name || '新对话' }}
        </button>
        <span v-else class="file-name">
          {{ file.name || '新对话' }}
        </span>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.file-item {
  padding: 10px 16px;
  margin-bottom: 8px;
  background-color: #f5f7fa;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.file-item:hover {
  background-color: #e6f0ff;
}
</style>