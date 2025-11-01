<script setup>
import { ElMessage } from "element-plus";
import { ArrowRight, FolderAdd } from '@element-plus/icons-vue'
import { ref, watch, computed } from "vue";
import { fileAPI } from "../services/file";
import { useRoute, useRouter } from 'vue-router';
defineOptions({ name: "FileController" })

const route = useRoute()
const router = useRouter()

const fileList = ref([])
const breadcrumbTrail = ref([{ id: null, name: '全部文件' }])

// 当前路径的 ID 数组（从根到当前文件夹）
const currentPathIds = computed(() => {
  const idStr = route.query.id
  if (typeof idStr === 'string' && idStr) {
    return idStr.split(',').map(id => id.trim()).filter(Boolean)
  }
  return []
})

// 当前文件夹的 ID
const currentFolderId = computed(() => {
  return currentPathIds.value.length > 0
      ? currentPathIds.value[currentPathIds.value.length - 1]
      : null
})

// 监听路由变化（包括前进/后退/初始加载）
watch(
    () => route.query.id,
    () => loadContent(),
    { immediate: true }
)

// 加载面包屑和文件列表
async function loadContent() {
  try {
    const rawList = await fileAPI.getFolderList(currentFolderId.value);
    fileList.value = rawList.map(item => ({
      ...item,
      editing: false,
    }));

    const trail = [{ id: null, name: '全部文件' }]
    for (const id of currentPathIds.value) {
      const info = await fileAPI.getInformation(id)
      trail.push({ id: id, name: info.name })
    }
    breadcrumbTrail.value = trail
  } catch (error) {
    console.error('加载失败:', error)
    ElMessage.warning('加载失败！请联系管理员')
    await router.replace({ path: '/file' })
  }
}

// 点击文件夹时
async function pushId(id) {
  if (id == null) {
    await router.push({ path: '/file' })
  } else {
    const newPath = [...currentPathIds.value, id]
    await router.push({ path: '/file', query: { id: newPath.join(',') } })
  }
}

// 点击面包屑时
async function navigateToTrail(index) {
  if (index === 0) {
    await router.push({ path: '/file' })
  } else {
    // 取前 index 个 ID（因为 breadcrumbTrail[0] 是根，对应空路径）
    const targetPath = currentPathIds.value.slice(0, index)
    const idStr = targetPath.length ? targetPath.join(',') : undefined
    await router.push({
      path: '/file',
      query: idStr ? { id: idStr } : {}
    })
  }
}

// 点击新建文件夹按钮时
async function newFolder() {
  const parentId = currentFolderId.value;
  const defaultName = '新建文件夹';

  const currentFiles = await fileAPI.getFolderList(parentId);
  const existingNames = new Set(
      currentFiles
          .filter(item => item.folder === true)
          .map(item => item.name)
  );

  let newName = defaultName;
  let counter = 1;

  while (existingNames.has(newName)) {
    counter++;
    newName = `${defaultName}(${counter})`;
  }

  const tempInfo = { parentId: parentId, name: newName, folder: true, editing: true }

  fileList.value = [tempInfo, ...fileList.value]

  // await fileAPI.createFolder(parentId, newName);
  // fileList.value = await fileAPI.getFolderList(parentId);
}
</script>

<template>
  <el-container>
    <el-main>
      <div class="header-section">
        <!-- 面包屑 -->
        <el-breadcrumb style="margin: 0" :separator-icon="ArrowRight">
          <el-breadcrumb-item
              v-for="(item, index) in breadcrumbTrail"
              :key="`${item.id}-${index}`"
              :to="undefined"
              @click="navigateToTrail(index)"
          >
            {{ item.name }}
          </el-breadcrumb-item>
        </el-breadcrumb>

        <!-- 新建文件夹按钮 -->
        <el-button
          type="primary"
          size="large"
          class="createFolder-button"
          @click="newFolder()"
        >
          <el-icon><FolderAdd /></el-icon>
          <span>新建文件夹</span>
        </el-button>
      </div>

      <div v-for="file in fileList" :key="file.id" class="file-item">
        <!-- 文件夹 -->
        <div v-if="file.folder">
          <input
              v-if="file.editing"
              v-model="file.name"
              @blur="finishEditing(file)"
              @keyup.enter="finishEditing(file)"
              class="file-name-input"
              autofocus
          />
          <div
              v-else
              class="folder-link file-name"
              role="button"
              tabindex="0"
              @click="pushId(file.id)"
              @keydown.enter="pushId(file.id)"
              @keydown.space.prevent="pushId(file.id)"
          >
            {{ file.name }}
          </div>
        </div>

        <!-- 普通文件 -->
        <div v-else class="file-name">
          {{ file.name }}
        </div>
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
  background-color: #a9c8ff;
}

.el-breadcrumb {
  padding: 16px 24px;
  background-color: #f9fafb;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 20px;

  .el-breadcrumb__item {
    .el-breadcrumb__inner {
      color: #606266;
      font-size: 14px;
      transition: color 0.2s ease;

      &:not(.is-disabled) {
        cursor: pointer;
        color: #409eff;

        &:hover {
          color: #66b1ff;
          text-decoration: underline;
        }
      }

      &.is-disabled {
        cursor: default;
        color: #909399;
        font-weight: normal;
      }
    }

    .el-breadcrumb__separator {
      color: #c0c4cc;
      margin: 0 8px;
    }
  }
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background-color: #f9fafb;
}

.createFolder-button {
  margin-right: 16px;
}
</style>