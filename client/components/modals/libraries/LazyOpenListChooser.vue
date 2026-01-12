<template>
  <div class="w-full h-full bg-bg absolute top-0 left-0 px-4 py-4 z-10">
    <div class="flex items-center py-1 mb-2">
      <span class="material-symbols text-3xl cursor-pointer hover:text-gray-300" @click="$emit('back')">arrow_back</span>
      <p class="px-4 text-xl">{{ $strings.HeaderChooseAFolder }} (OpenList)</p>
    </div>

    <!-- Connection Status -->
    <div v-if="!connectionChecked" class="py-12 text-center">
      <ui-loading-indicator />
      <p class="mt-4">{{ $strings.MessageCheckingConnection || 'Checking OpenList connection...' }}</p>
    </div>

    <div v-else-if="!isConnected" class="py-12 text-center max-w-md mx-auto">
      <p class="text-lg text-error mb-2">{{ $strings.MessageOpenListNotConnected || 'OpenList not connected' }}</p>
      <p class="text-gray-300 mb-4">{{ connectionError || 'Please check your OPENLIST_URL and OPENLIST_TOKEN configuration.' }}</p>
      <ui-btn color="bg-primary" @click="checkConnection">{{ $strings.ButtonRetry || 'Retry' }}</ui-btn>
    </div>

    <template v-else>
      <div v-if="rootDirs.length || selectedPath" class="w-full bg-primary/70 py-1 px-4 mb-2">
        <p class="font-mono truncate">{{ selectedPath || '/' }}</p>
      </div>

      <div v-if="rootDirs.length || selectedPath" class="relative flex bg-primary/50 p-4 folder-container">
        <div class="w-1/2 border-r border-bg h-full overflow-y-auto">
          <div v-if="level > 0" class="w-full p-1 cursor-pointer flex items-center hover:bg-white/10" @click="goBack">
            <span class="material-symbols fill text-yellow-200" style="font-size: 1.2rem">folder</span>
            <p class="text-base font-mono px-2">..</p>
          </div>
          <div v-for="dir in _directories" :key="dir.path" class="dir-item w-full p-1 cursor-pointer flex items-center hover:text-white text-gray-200 hover:bg-white/10" :class="dir.className" @click="selectDir(dir)">
            <span class="material-symbols fill text-yellow-200" style="font-size: 1.2rem">folder</span>
            <p class="text-base font-mono px-2 truncate">{{ dir.dirname }}</p>
            <span v-if="dir.path === selectedPath" class="material-symbols" style="font-size: 1.1rem">arrow_right</span>
          </div>
        </div>
        <div class="w-1/2 h-full overflow-y-auto">
          <div v-for="dir in _subdirs" :key="dir.path" :class="dir.className" class="dir-item w-full p-1 cursor-pointer flex items-center hover:text-white text-gray-200 hover:bg-white/10" @click="selectSubDir(dir)">
            <span class="material-symbols fill text-yellow-200" style="font-size: 1.2rem">folder</span>
            <p class="text-base font-mono px-2 truncate">{{ dir.dirname }}</p>
          </div>
        </div>
        <div v-if="loadingDirs" class="absolute inset-0 w-full h-full flex items-center justify-center bg-black/10">
          <ui-loading-indicator />
        </div>
      </div>

      <div v-else-if="initialLoad" class="py-12 text-center">
        <p>{{ $strings.MessageLoadingFolders }}</p>
      </div>

      <div v-else class="py-12 text-center max-w-sm mx-auto">
        <p class="text-lg mb-2">{{ $strings.MessageNoFoldersAvailable }}</p>
        <p class="text-gray-300 mb-2">{{ $strings.NoteOpenListFolderPicker || 'No directories found in OpenList root. Make sure you have mounted storage in OpenList.' }}</p>
      </div>

      <div class="w-full py-2">
        <ui-btn :disabled="!selectedPath" color="bg-primary" class="w-full mt-2" @click="selectFolder">{{ $strings.ButtonSelectFolderPath }}</ui-btn>
      </div>
    </template>
  </div>
</template>

<script>
export default {
  props: {
    paths: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      connectionChecked: false,
      isConnected: false,
      connectionError: null,
      initialLoad: false,
      loadingDirs: false,
      rootDirs: [],
      directories: [],
      selectedPath: '',
      subdirs: [],
      level: 0
    }
  },
  computed: {
    _directories() {
      return this.directories.map((d) => {
        var isUsed = !!this.paths.find((path) => {
          // 移除 openlist: 前缀进行比较
          const cleanPath = path.replace(/^openlist:\/*/i, '')
          const cleanDPath = d.path.replace(/^openlist:\/*/i, '')
          return cleanPath === cleanDPath || cleanPath.startsWith(cleanDPath + '/')
        })
        var isSelected = d.path === this.selectedPath
        var classes = []
        if (isSelected) classes.push('dir-selected')
        if (isUsed) classes.push('dir-used')
        return {
          isUsed,
          isSelected,
          className: classes.join(' '),
          ...d
        }
      })
    },
    _subdirs() {
      return this.subdirs.map((d) => {
        var isUsed = !!this.paths.find((path) => {
          const cleanPath = path.replace(/^openlist:\/*/i, '')
          const cleanDPath = d.path.replace(/^openlist:\/*/i, '')
          return cleanPath === cleanDPath || cleanPath.startsWith(cleanDPath + '/')
        })
        var classes = []
        if (isUsed) classes.push('dir-used')
        return {
          isUsed,
          className: classes.join(' '),
          ...d
        }
      })
    }
  },
  methods: {
    async checkConnection() {
      this.connectionChecked = false
      this.connectionError = null
      
      try {
        const response = await this.$axios.$get('/api/filesystem/openlist/status')
        this.isConnected = response.connected
        
        if (!response.enabled) {
          this.connectionError = 'OpenList not configured. Please set OPENLIST_URL and OPENLIST_TOKEN.'
        } else if (!response.connected) {
          this.connectionError = response.error || 'Failed to connect to OpenList server.'
        }
        
        this.connectionChecked = true
        
        if (this.isConnected) {
          await this.init()
        }
      } catch (error) {
        console.error('Failed to check OpenList connection', error)
        this.isConnected = false
        this.connectionError = error.message || 'Failed to check connection'
        this.connectionChecked = true
      }
    },
    async goBack() {
      let selPath = this.selectedPath
      var splitPaths = selPath.split('/').filter(p => p)

      let previousPath = ''
      let lookupPath = ''

      if (splitPaths.length > 1) {
        lookupPath = '/' + splitPaths.slice(0, -1).join('/')
        previousPath = lookupPath
      } else {
        lookupPath = '/'
        previousPath = '/'
      }

      this.level--
      this.subdirs = this.directories
      this.selectedPath = previousPath
      this.directories = await this.fetchDirs(lookupPath, this.level)
    },
    async selectDir(dir) {
      if (dir.isUsed) return
      this.selectedPath = dir.path
      this.level = dir.level
      this.subdirs = await this.fetchDirs(dir.path, dir.level + 1)
    },
    async selectSubDir(dir) {
      if (dir.isUsed) return
      this.selectedPath = dir.path
      this.level = dir.level
      this.directories = this.subdirs
      this.subdirs = await this.fetchDirs(dir.path, dir.level + 1)
    },
    selectFolder() {
      if (!this.selectedPath) {
        console.error('No Selected path')
        return
      }
      
      // 检查是否已经添加了父目录
      const cleanSelectedPath = this.selectedPath.replace(/^openlist:\/*/i, '')
      const hasParent = this.paths.find((p) => {
        const cleanPath = p.replace(/^openlist:\/*/i, '')
        return cleanSelectedPath.startsWith(cleanPath + '/')
      })
      
      if (hasParent) {
        this.$toast.error(`Oops, you cannot add a subdirectory of a folder already added`)
        return
      }
      
      // 添加 openlist: 前缀
      const fullPath = `openlist:${this.selectedPath}`
      this.$emit('select', fullPath)
      this.selectedPath = ''
    },
    fetchDirs(path) {
      this.loadingDirs = true
      const encodedPath = encodeURIComponent(path)
      return this.$axios
        .$get(`/api/filesystem/openlist?path=${encodedPath}`)
        .then((data) => {
          console.log('Fetched OpenList directories', data.directories)
          return data.directories || []
        })
        .catch((error) => {
          console.error('Failed to get OpenList paths', error)
          this.$toast.error(this.$strings.ToastFailedToLoadData)
          return []
        })
        .finally(() => {
          this.loadingDirs = false
        })
    },
    async init() {
      this.initialLoad = true
      this.rootDirs = await this.fetchDirs('/')
      this.initialLoad = false

      this.directories = this.rootDirs
      this.subdirs = []
      this.selectedPath = ''
      this.level = 0
    }
  },
  mounted() {
    this.checkConnection()
  }
}
</script>

<style scoped>
.dir-item.dir-selected {
  background-color: rgba(255, 255, 255, 0.1);
}
.dir-item.dir-used {
  background-color: rgba(255, 25, 0, 0.1);
}
.folder-container {
  max-height: calc(100% - 130px);
  height: calc(100% - 130px);
  min-height: calc(100% - 130px);
}
</style>
