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
// 面包屑名称缓存：ID -> Name
const folderCache = new Map();

const infoDialogVisible = ref(false);
const fileInfo = ref({});

const uploadInfoDialogVisible = ref(false);
const currentFileId = ref(null);
const isDownloading = ref(false);
const downloadPercent = ref(0);
const downloadingFileName = ref("");
const uploadInfoForm = ref({
  projectName: "",
  projectStartDate: "",
  projectDuration: null,
  projectManager: "",
  projectManagerSecond: "",
  projectLocation: "",
  projectPartner: "",
});

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleString("zh-CN");
};

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

    // 1. 过滤出缓存中不存在的 ID
    const missingIds = currentPathIds.value.filter(
      (id) => !folderCache.has(id),
    );

    // 2. 仅请求缺失的 ID
    if (missingIds.length > 0) {
      const promises = missingIds.map((id) => fileAPI.getRawInformation(id));
      const responses = await Promise.all(promises);

      for (let i = 0; i < responses.length; i++) {
        const responseJson = responses[i];
        const id = missingIds[i];
        if (responseJson.code === 200) {
          // 写入缓存
          folderCache.set(id, responseJson.data.name);
        } else {
          ElMessage.error("加载失败：", responseJson.msg);
          await router.replace({ path: "/file" });
          return;
        }
      }
    }

    // 3. 从缓存构建面包屑
    for (const id of currentPathIds.value) {
      if (folderCache.has(id)) {
        trail.push({ id: id, name: folderCache.get(id) });
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
      fileList.value = responseJson.data
        .map((item) => ({
          ...item,
          editing: 0,
        }))
        .sort((a, b) => {
          if (a.folder && !b.folder) return -1;
          if (!a.folder && b.folder) return 1;
          return a.name.localeCompare(b.name, "zh-CN");
        });
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

// 点击查看文件信息按钮
async function clickInfoButton(file) {
  try {
    const responseJson = await fileAPI.getInformation(file.id);
    if (responseJson.code === 200) {
      fileInfo.value = responseJson.data;
      infoDialogVisible.value = true;
    } else {
      ElMessage.error("获取信息失败：" + responseJson.msg);
    }
  } catch (error) {
    console.error("获取信息失败:", error);
    ElMessage.warning("获取信息失败！请联系管理员");
  }
}

// 打开上传文件信息弹窗
function openUploadInfoDialog(file) {
  currentFileId.value = file.id;
  // 重置表单
  uploadInfoForm.value = {
    projectName: "",
    projectStartDate: "",
    projectDuration: null,
    projectManager: "",
    projectManagerSecond: "",
    projectLocation: "",
    projectPartner: "",
  };
  uploadInfoDialogVisible.value = true;
}

// 提交上传文件信息
async function submitUploadInfo() {
  if (!uploadInfoForm.value.projectName) {
    ElMessage.warning("请输入项目名称");
    return;
  }

  try {
    const responseJson = await fileAPI.postUploadFileInfo(
      currentFileId.value,
      uploadInfoForm.value,
    );
    if (responseJson.code === 200) {
      ElMessage.success("文件信息上传成功！");
      uploadInfoDialogVisible.value = false;
    } else {
      ElMessage.error("上传失败：" + (responseJson.msg || "未知错误"));
    }
  } catch (error) {
    console.error("上传文件信息失败:", error);
    ElMessage.warning("上传失败！请联系管理员");
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
        // 更新缓存中的名称
        folderCache.set(checkedId, name);
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
async function downloadFile(id, name) {
  isDownloading.value = true;
  downloadPercent.value = 0;
  downloadingFileName.value = name || "";
  ElMessage.success("开始下载！");
  const response = await fileAPI.getDownloadFile(id, (event) => {
    if (!event.total) return;
    downloadPercent.value = Number(
      ((event.loaded / event.total) * 100).toFixed(2),
    );
  });
  const contentDisposition = response.headers.get("Content-Disposition");
  const fileUrl = URL.createObjectURL(response.data);

  // 提取文件名，兼容 filename= 和 filename*=，并处理 + 号为空格的问题
  let filename = "downloaded-file";
  if (contentDisposition) {
    console.log("Content-Disposition:", contentDisposition);
    // 匹配 filename= 或 filename*= 的值，自动去除引号
    const match = contentDisposition.match(
      /filename\*?=['"]?(?:UTF-8'')?([^;"']+)['"]?/i,
    );
    if (match && match[1]) {
      // 先将 URL 编码中的 + 替换为 %20，再进行解码
      filename = decodeURIComponent(match[1].replace(/\+/g, "%20"));
    }
  }

  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(fileUrl);
  isDownloading.value = false;
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
      <!-- 下载进度条 -->
      <div v-if="isDownloading" class="download-progress-fixed">
        <div style="margin-bottom: 10px">
          正在下载文件：{{ downloadingFileName || "未知文件" }}
        </div>
        <el-progress
          :percentage="downloadPercent"
          :stroke-width="12"
          style="margin-bottom: 5px"
        />
      </div>

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
                  @click="downloadFile(file.id, file.name)"
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
                <el-dropdown-item
                  @click="clickInfoButton(file)"
                  v-if="!file.folder"
                  >查看文件信息</el-dropdown-item
                >
                <el-dropdown-item
                  @click="openUploadInfoDialog(file)"
                  v-if="!file.folder"
                  >上传文件信息</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 上传文件信息弹窗 -->
      <el-dialog
        v-model="uploadInfoDialogVisible"
        title="上传文件信息"
        width="600px"
      >
        <el-form :model="uploadInfoForm" label-width="120px">
          <el-form-item required label="项目名称">
            <el-input v-model="uploadInfoForm.projectName" />
          </el-form-item>
          <el-form-item label="项目创建日期">
            <el-date-picker
              v-model="uploadInfoForm.projectStartDate"
              type="date"
              placeholder="选择日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item label="项目工期(天)">
            <el-input-number
              v-model="uploadInfoForm.projectDuration"
              :min="0"
            />
          </el-form-item>
          <el-form-item label="项目负责人">
            <el-input v-model="uploadInfoForm.projectManager" />
          </el-form-item>
          <el-form-item label="项目第二负责人">
            <el-input v-model="uploadInfoForm.projectManagerSecond" />
          </el-form-item>
          <el-form-item label="项目实施位置">
            <el-input v-model="uploadInfoForm.projectLocation" />
          </el-form-item>
          <el-form-item label="项目乙方单位">
            <el-input v-model="uploadInfoForm.projectPartner" />
          </el-form-item>
        </el-form>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="uploadInfoDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="submitUploadInfo">
              确定上传
            </el-button>
          </span>
        </template>
      </el-dialog>

      <!-- 文件信息弹窗 -->
      <el-dialog v-model="infoDialogVisible" title="文件详情" width="500px">
        <el-form :model="fileInfo" label-width="120px">
          <el-form-item label="所属项目名称">
            <span>{{ fileInfo.projectName || "-" }}</span>
          </el-form-item>
          <el-form-item label="项目创建日期">
            <span>{{ fileInfo.projectStartDate || "-" }}</span>
          </el-form-item>
          <el-form-item label="项目工期">
            <span>{{
              fileInfo.projectDuration ? fileInfo.projectDuration + " 天" : "-"
            }}</span>
          </el-form-item>
          <el-form-item label="项目负责人">
            <span>{{ fileInfo.projectManager || "-" }}</span>
          </el-form-item>
          <el-form-item label="项目第二负责人">
            <span>{{ fileInfo.projectManagerSecond || "-" }}</span>
          </el-form-item>
          <el-form-item label="项目实施位置">
            <span>{{ fileInfo.projectCity || "-" }}</span>
          </el-form-item>
          <el-form-item label="项目乙方单位">
            <span>{{ fileInfo.projectPartner || "-" }}</span>
          </el-form-item>
          <el-form-item label="创建时间">
            <span>{{ formatDate(fileInfo.created) }}</span>
          </el-form-item>
          <el-form-item label="更新时间">
            <span>{{ formatDate(fileInfo.updated) }}</span>
          </el-form-item>
        </el-form>
      </el-dialog>
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

.download-progress-fixed {
  position: fixed;
  left: 16px;
  bottom: 16px;
  width: 400px;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.65);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 2000;

  :deep(.el-progress-bar__outer) {
    background-color: rgba(255, 255, 255, 0.15);
  }

  :deep(.el-progress__text) {
    color: #fff;
  }
}
</style>
