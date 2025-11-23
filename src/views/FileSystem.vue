<script setup>
// TODO：返回的时候好像会自动在空白处加加号，排查问题
import { ElMessage } from "element-plus";
import {
  ArrowRight,
  Check,
  Close,
  FolderAdd,
  Operation,
} from "@element-plus/icons-vue";
import { computed, nextTick, ref, watch } from "vue";
import { fileAPI } from "../services/file";
import { useRoute, useRouter } from "vue-router";
import { filesize } from "filesize";

defineOptions({ name: "FileController" });

const route = useRoute();
const router = useRouter();

const fileList = ref([]);
const breadcrumbTrail = ref([{ id: null, name: "全部文件" }]);
const existingNew = ref(false);
// 处于重命名状态的文件 ID
const renamingId = ref(null);
// 下拉菜单实例的 Map，用于控制关闭时机
const dropdownRefs = ref(new Map());

// 是否有文件处于编辑状态
const isAnyEditing = computed(
  () =>
    Array.isArray(fileList.value) &&
    fileList.value.some((f) => f.editing !== 0),
);

// 当前路径的 ID 数组（从根到当前文件夹）
const currentPathIds = computed(() => {
  const idStr = route.query.id;
  if (typeof idStr === "string" && idStr) {
    return idStr
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
});

// 当前文件夹的 ID
const currentFolderId = computed(() => {
  return currentPathIds.value.length > 0
    ? currentPathIds.value[currentPathIds.value.length - 1]
    : null;
});

// 监听路由变化（包括前进/后退/初始加载）
watch(
  () => route.query.id,
  () => loadContent(),
  { immediate: true },
);

// 加载面包屑和文件列表
async function loadContent() {
  try {
    await reloadContent();

    const trail = [{ id: null, name: "全部文件" }];
    for (const id of currentPathIds.value) {
      const responseJson = await fileAPI.getInformation(id);
      if (responseJson.code === 200) {
        const info = responseJson.data;
        trail.push({ id: id, name: info.name });
      } else {
        ElMessage.error("加载失败：", responseJson.msg);
        await router.replace({ path: "/file" });
      }
    }
    breadcrumbTrail.value = trail;
  } catch (error) {
    console.error("加载失败:", error);
    ElMessage.warning("加载失败！请联系管理员");
  }
}

// 点击文件夹时
async function pushId(id) {
  if (id == null) {
    await router.push({ path: "/file" });
  } else {
    const newPath = [...currentPathIds.value, id];
    await router.push({ path: "/file", query: { id: newPath.join(",") } });
  }
}

// 点击面包屑时
async function navigateToTrail(index) {
  if (index === 0) {
    await router.push({ path: "/file" });
  } else {
    // 取前 index 个 ID（因为 breadcrumbTrail[0] 是根，对应空路径）
    const targetPath = currentPathIds.value.slice(0, index);
    const idStr = targetPath.length ? targetPath.join(",") : undefined;
    await router.push({
      path: "/file",
      query: idStr ? { id: idStr } : {},
    });
  }
}

// 点击新建文件夹按钮
async function clickCreateFolder() {
  if (existingNew.value) {
    ElMessage.warning("请先保存或取消新建文件夹");
    return;
  }
  const parentId = currentFolderId.value;
  const defaultName = "新建文件夹";

  const responseJson = await fileAPI.getFolderList(parentId);
  if (responseJson.code === 200) {
    const currentFiles = responseJson.data;
    const existingNames = new Set(
      currentFiles
        .filter((item) => item.folder === true)
        .map((item) => item.name),
    );

    let newName = defaultName;
    let counter = 1;

    while (existingNames.has(newName)) {
      counter++;
      newName = `${defaultName}(${counter})`;
    }

    // 生成唯一的临时 ID 用于聚焦
    const tempId = `temp-${Date.now()}`;
    const tempInfo = {
      id: tempId,
      parentId: parentId,
      name: newName,
      folder: true,
      editing: 1,
    };

    fileList.value = [tempInfo, ...fileList.value];

    // 等待 DOM 更新后聚焦输入框
    await nextTick();
    // 查找第一个新建文件夹输入框（新建的文件夹总是放在列表第一位）
    // 更精确地查找：第一个 .file-item 下的 .createFolder-input
    const firstFileItem = document.querySelector(".file-item");
    if (firstFileItem) {
      const inputWrapper = firstFileItem.querySelector(".createFolder-input");
      if (inputWrapper) {
        // Element Plus 的 el-input 内部会有一个 input 元素
        const inputEl = inputWrapper.querySelector("input");
        if (inputEl) {
          inputEl.focus();
        }
      }
    }
    existingNew.value = true;
  } else {
    ElMessage.error("加载失败：", responseJson.msg);
  }
}

// 创建文件夹
async function createFolder(parentId, newName) {
  try {
    const responseJson = await fileAPI.postCreateFolder(parentId, newName);
    if (responseJson.code === 200) {
      await reloadContent();
      ElMessage.success("创建成功！");
    } else {
      ElMessage.error("创建失败：", responseJson.msg);
    }
  } catch (error) {
    console.error("创建文件夹失败:", error);
    ElMessage.warning("创建文件夹失败！请联系管理员");
  }
}

// 重新加载目录，取消新建文件夹
async function reloadContent() {
  try {
    const responseJson = await fileAPI.getFolderList(currentFolderId.value);
    if (responseJson.code === 200) {
      fileList.value = responseJson.data.map((item) => ({
        ...item,
        editing: 0,
      }));
      existingNew.value = false;
    } else {
      ElMessage.error("加载失败：", responseJson.msg);
    }
  } catch (error) {
    console.error("加载失败:", error);
    ElMessage.warning("加载失败！请联系管理员");
  }
}

// 点击重命名文件按钮
async function clickRenameButton(file) {
  // 清空其他项的编辑态
  if (Array.isArray(fileList.value)) {
    fileList.value.forEach((f) => {
      f.editing = 0;
    });
  }

  file.editing = 2;
  await nextTick();
  const inputEl = document.querySelector(".file-item .name-input input");
  if (inputEl) {
    inputEl.focus();
  }
}

// 判断打钩执行的是新建还是重命名
async function checkOrRename(editing, fatherId, checkedId, name) {
  // editing: 1 新建文件夹 2 重命名文件
  if (editing === 1) {
    const responseJson = await createFolder(fatherId, name);
    if (responseJson.code === 200) {
      await reloadContent();
      ElMessage.success("创建成功！");
    } else {
      ElMessage.error("创建失败：", responseJson.msg);
    }
  } else if (editing === 2) {
    if (renamingId.value) return;
    renamingId.value = checkedId;
    const responseJson = await fileAPI.putRenameFile(checkedId, name);
    try {
      if (responseJson.code === 200) {
        await reloadContent();
        ElMessage.success("重命名成功！");
      } else {
        ElMessage.error("重命名失败：", responseJson.msg);
      }
    } finally {
      renamingId.value = null;
    }
  }
}

// 删除文件
async function deleteFile(id) {
  try {
    const responseJson = await fileAPI.deleteDeleteFile(id);
    if (responseJson.code === 200) {
      await reloadContent();
      ElMessage.success("删除成功！");
    } else {
      ElMessage.error("删除失败：", responseJson.msg);
    }
  } catch (error) {
    console.error("删除失败:", error);
    ElMessage.warning("删除失败！请联系管理员");
  }
}

// 下载文件
async function downloadFile(id) {
  const response = await fileAPI.getDownloadFile(id);
  const contentDisposition = response.headers.get("Content-Disposition");
  const fileUrl = URL.createObjectURL(response.data);

  let filename = contentDisposition.match(/filename*?=(?:UTF-8'')?([^;]+)/i);
  filename = decodeURIComponent(filename[1].replace(/^"|"$/g, ""));

  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = filename;
  link.click();

  ElMessage.success("开始下载！");
  URL.revokeObjectURL(fileUrl);
}

// 计算文件大小
function calculateFileSize(size) {
  return filesize(size, { standard: "jedec" });
}

// 前往上传界面
function gotoUpload() {
  router.push({
    name: "Upload",
    query: {
      folderId: route.query.id,
    },
  });
}
</script>

<template>
  <el-container>
    <el-main style="margin: 0 400px">
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

        <!-- 文件上传按钮（会跳转到上传界面） -->
        <el-button
          type="default"
          size="large"
          class="upload-button"
          @click="gotoUpload()"
          round
        >
          <el-icon><Upload /></el-icon>
          上传文件
        </el-button>

        <!-- 新建文件夹按钮 -->
        <el-button
          type="primary"
          size="large"
          class="createFolder-button"
          @click="clickCreateFolder()"
        >
          <el-icon><FolderAdd /></el-icon>
          <span style="font-size: 12px">新建文件夹</span>
        </el-button>
      </div>

      <div v-for="file in fileList" :key="file.id" class="file-item">
        <!-- 编辑状态 -->
        <div v-if="file.editing !== 0" class="file-item-editing">
          <el-input class="name-input" v-model="file.name" clearable />
          <el-button
            type="primary"
            @click="
              checkOrRename(file.editing, currentFolderId, file.id, file.name)
            "
            size="small"
            :loading="renamingId === file.id"
            :disabled="renamingId && renamingId !== file.id"
          >
            <el-icon><Check /></el-icon>
          </el-button>
          <el-button @click="reloadContent()" size="small">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>

        <!-- 正常状态 -->
        <div v-else class="file-item-normal">
          <!-- 文件夹 -->
          <div
            v-if="file.folder"
            class="folder-link file-name"
            role="button"
            tabindex="0"
            @click="pushId(file.id)"
            @keydown.enter="pushId(file.id)"
            @keydown.space.prevent="pushId(file.id)"
          >
            {{ file.name }}
          </div>

          <!-- 文件 -->
          <div v-else class="file-name">
            <span class="file-name-text">{{ file.name }}</span>
            <span class="file-size-text">{{
              calculateFileSize(file.size)
            }}</span>
          </div>
          <el-dropdown trigger="click" size="large" :hide-on-click="false">
            <el-button
              size="default"
              :disabled="isAnyEditing && file.editing === 0"
            >
              菜单
              <el-icon class="el-icon--right" size="large"
                ><Operation
              /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  @click="downloadFile(file.id)"
                  v-if="!file.folder"
                  >下载</el-dropdown-item
                >
                <el-dropdown-item @click="clickRenameButton(file)"
                  >重命名</el-dropdown-item
                >
                <el-dropdown-item class="my-class">
                  <el-popconfirm
                    icon-color="#f56c6c"
                    title="确定要删除吗？"
                    confirm-button-text="确定"
                    @confirm="deleteFile(file.id)"
                    confirm-button-type="danger"
                    cancel-button-text="取消"
                    @cancel="reloadContent()"
                    cancel-button-type="info"
                  >
                    <template #reference>
                      <span class="dropdown-item-delete-fullSpan">删除</span>
                    </template>
                  </el-popconfirm>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.file-item {
  font-size: 16px;
  padding: 0 16px;
  margin-bottom: 0;
  border-radius: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-bottom: none;
  box-shadow: none;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
  cursor: pointer;
  display: flex;
  align-items: center;
  min-height: 48px;
}

.file-item:first-child {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.file-item:last-child {
  border-bottom: 1px solid var(--el-border-color);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.file-item:hover {
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
  border-color: color-mix(
    in srgb,
    var(--el-color-primary) 25%,
    var(--el-border-color)
  );
}

.file-item:active {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.el-breadcrumb {
  padding: 16px 24px;
  margin-bottom: 20px;

  .el-breadcrumb__item {
    .el-breadcrumb__inner {
      font-size: 14px;
      transition: color 0.2s ease;

      &:not(.is-disabled) {
        cursor: pointer;

        &:hover {
          color: var(--el-color-primary);
        }
      }

      &.is-disabled {
        cursor: default;
        font-weight: normal;
      }
    }

    .el-breadcrumb__separator {
      margin: 0 8px;
      color: var(--el-text-color-secondary);
    }
  }
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 10px 16px;
  min-height: 50px;
}

.upload-button {
  margin-left: auto;
}

.createFolder-button {
  margin-right: 16px;
}

.name-input {
  font-size: 16px;
  width: 200px;
  min-height: 28px;
  margin-right: 16px;
  :deep(input::placeholder) {
    color: var(--el-text-color-placeholder);
  }
  :deep(.el-input__wrapper) {
    background: var(--el-bg-color);
  }
}

.file-item-editing {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 48px;
  background: var(--el-bg-color);
  padding: 8px 10px;
}

.file-item-normal {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 48px;
}

.file-name {
  color: var(--el-text-color-primary);
  display: flex;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size-text {
  margin-left: auto;
  flex-shrink: 0;
  margin-right: 12px;
  color: var(--el-text-color-secondary);
}

.action-button {
  flex-shrink: 0;
  margin-left: 12px;
}

/* 编辑状态按钮间距与尺寸优化 */
.file-item-editing :deep(.el-button) {
  margin-left: 6px;
}

/* 文件/文件夹图标伪元素（无需改模板） */
.file-item-normal .folder-link::before {
  content: "📁";
  margin-right: 8px;
  font-size: 16px;
}

.file-item-normal .file-name:not(.folder-link)::before {
  content: "📄";
  margin-right: 8px;
  font-size: 16px;
}

.file-item-normal .folder-link {
  color: var(--el-color-primary);
  font-weight: 600;
}

.file-item-normal .folder-link:hover {
  text-decoration: underline;
}

.dropdown-item-delete-fullSpan {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  cursor: pointer;
  padding: 7px 20px;
}

::v-deep(.el-dropdown-menu__item.my-class) {
  padding: 0;
}
</style>
