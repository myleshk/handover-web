<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2 class="header-title">Handover Chat</h2>
      <span class="status-group" v-if="connected">
        <span class="status">{{ statusText }}</span>
        <span class="own-name" v-if="ownName">{{ ownName }}</span>
      </span>
      <button v-if="connected && paired" class="btn btn-small" @click="rematch">Re-match</button>
    </div>

    <div class="messages" ref="messagesRef">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.type, { 'file-msg': msg.file }]">
        <span v-if="msg.showSender" class="sender">{{ msg.sender }}</span>
        <template v-if="msg.file">
          <template v-if="msg.recycled">
            <span class="file-link recycled">
              <span class="file-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </span>
              <span class="file-info">
                <span class="file-name">{{ msg.fileName }}</span>
                <span class="file-meta">Removed</span>
              </span>
            </span>
          </template>
          <a v-else :href="msg.fileUrl" class="file-link" :download="msg.fileName">
            <span class="file-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
              </svg>
            </span>
            <span class="file-info">
              <span class="file-name">{{ msg.fileName }}</span>
              <span class="file-meta" v-if="msg.fileSize">{{ formatFileSize(msg.fileSize) }}</span>
            </span>
          </a>
        </template>
        <template v-else>{{ msg.content }}</template>
      </div>
    </div>

    <div v-if="uploading" class="upload-progress">
      <div class="upload-progress-bar" :style="{ width: progress + '%' }"></div>
    </div>

    <div class="chat-input">
      <input ref="fileInputRef" type="file" class="file-input-hidden" multiple @change="uploadFile" />
      <button class="btn-attach" :disabled="!paired || uploading" @click="selectFile" title="Attach file">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
        </svg>
      </button>
      <textarea ref="inputRef" v-model="inputText" placeholder="Type a message..." :disabled="!paired" rows="1" @keydown="onInputKeydown" @input="onInput"></textarea>
      <button class="btn-send" :disabled="!paired || !inputText.trim()" @click="sendMessage">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Centrifuge } from 'centrifuge'

const messages = ref([])
const inputText = ref('')
const connected = ref(false)
const paired = ref(false)
const ownName = ref('')
const partnerName = ref('')
const statusText = ref('Disconnected')
const messagesRef = ref(null)
const inputRef = ref(null)
const fileInputRef = ref(null)
const uploading = ref(false)
const progress = ref(null) // 0-100 or null when idle

let centrifuge = null
let clientId = null
let deviceToken = null

// Compute the backend base URL from the Centrifuge HTTP URL
const backendBaseUrl = computed(() => {
  const url = import.meta.env.VITE_BACKEND_HTTP_URL || ''
  return url.replace(/\/centrifuge\/?$/, '')
})

const setUnpaired = (reason) => {
  if (paired.value) {
    paired.value = false
    partnerName.value = ''
    statusText.value = 'Waiting for partner...'
    addMessage(reason, 'system')
    // Files are deleted on the server when the pair is disbanded.
    messages.value.forEach(msg => {
      if (msg.file) msg.recycled = true
    })
  }
}

const addMessage = (content, type = 'system', sender = '') => {
  messages.value.push({ content, type, sender, showSender: !!sender })
  scrollToBottom()
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

const getOrCreateDeviceId = () => {
  const key = 'handover_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  deviceToken = id
  return id
}

const connect = () => {
  const { VITE_BACKEND_HTTP_URL, VITE_BACKEND_WS_URL } = import.meta.env;

  const deviceId = getOrCreateDeviceId()
  console.log('Device ID:', deviceId)

  centrifuge = new Centrifuge([
    { transport: 'websocket', endpoint: VITE_BACKEND_WS_URL },
    { transport: 'sse', endpoint: VITE_BACKEND_HTTP_URL + "/connection/sse" },
  ], {
    emulationEndpoint: VITE_BACKEND_HTTP_URL + "/emulation",
    token: deviceId,
  })

  centrifuge.on('connected', (ctx) => {
    clientId = ctx.client
    connected.value = true
    statusText.value = 'Waiting for partner...'
    addMessage('Connected to server', 'system')
    console.log('My ID:', ctx.client)
  })

  centrifuge.on('disconnected', () => {
    connected.value = false
    paired.value = false
    ownName.value = ''
    partnerName.value = ''
    statusText.value = 'Disconnected'
    addMessage('Disconnected from server', 'system')
  })

  centrifuge.on('publication', (ctx) => {
    const data = ctx.data
    if (!data) return
    if (data.type === 'name_assigned') {
      ownName.value = data.name
    } else if (data.type === 'paired') {
      paired.value = true
      partnerName.value = data.partnerName || data.partner
      statusText.value = 'Paired'
      addMessage(`Paired with ${data.partnerName || data.partner}`, 'system')
    } else if (data.type === 'chat') {
      if (data.from === clientId) {
        addMessage(data.content, 'self')
      } else {
        addMessage(data.content, 'other', data.name || data.from)
      }
    } else if (data.type === 'file') {
      // File messages use the persistent device token as "from", not
      // the ephemeral Centrifuge client ID.
      if (data.from === deviceToken) {
        addFileMessage(data, 'self')
      } else {
        addFileMessage(data, 'other')
      }
    } else if (data.type === 'unpaired') {
      setUnpaired(data.content)
    } else if (data.type === 'system') {
      addMessage(data.content, 'system')
    }
  })

  centrifuge.on('subscribed', (ctx) => {
    console.log('Server subscribed:', ctx.channel)
  })

  centrifuge.connect()
}

const rematch = async () => {
  try {
    paired.value = false
    partnerName.value = ''
    statusText.value = 'Re-matching...'
    const res = await centrifuge.rpc('rematch')
    if (res && res.data) {
      if (res.data.type === 'paired') {
        paired.value = true
        partnerName.value = res.data.partnerName || res.data.partner
        statusText.value = 'Paired'
        addMessage(`Paired with ${res.data.partnerName || res.data.partner}`, 'system')
      } else {
        statusText.value = 'Waiting for partner...'
        if (res.data.content) {
          addMessage(res.data.content, 'system')
        }
      }
    }
  } catch (err) {
    addMessage(`Error: ${err.message}`, 'system')
  }
}

const onInputKeydown = (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    sendMessage()
  }
}

const onInput = () => {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const sendMessage = async () => {
  if (!inputText.value.trim() || !paired) return
  try {
    await centrifuge.rpc('chat', { content: inputText.value.trim() })
    inputText.value = ''
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
    }
  } catch (err) {
    addMessage(`Error: ${err.message}`, 'system')
  }
}

const addFileMessage = (data, type) => {
  // Resolve relative file URLs against the API backend, not the page origin.
  const url = data.file_url?.startsWith('/') ? backendBaseUrl.value + data.file_url : data.file_url
  messages.value.push({
    type,
    file: true,
    fileUrl: url,
    fileName: data.content,
    fileSize: data.file_size,
    fileType: data.file_type,
    sender: type === 'other' ? (data.name || data.from) : '',
    showSender: type === 'other',
  })
  scrollToBottom()
}

const formatFileSize = (bytes) => {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const selectFile = () => {
  fileInputRef.value?.click()
}

const uploadFile = (event) => {
  const files = event.target.files
  if (!files?.length || !paired.value) return

  uploading.value = true
  progress.value = 0

  const baseUrl = backendBaseUrl.value
  const maxSize = 50 * 1024 * 1024 // 50 MB

  // Filter out oversized files — show a message but don't upload.
  const valid = []
  for (const f of files) {
    if (f.size > maxSize) {
      addMessage(`Skipped: ${f.name} exceeds 50 MB limit`, 'system')
    } else {
      valid.push(f)
    }
  }
  if (valid.length === 0) {
    uploading.value = false
    progress.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }

  const total = valid.length
  let completed = 0

  // Safety reset: release the button state after 30s no matter what.
  const safetyTimer = setTimeout(() => {
    if (uploading.value) {
      uploading.value = false
      progress.value = null
    }
  }, 30000)

  const resetInput = () => {
    clearTimeout(safetyTimer)
    uploading.value = false
    progress.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
  }

  const done = () => {
    completed++
    progress.value = Math.round((completed / total) * 100)
    if (completed < total) return
    resetInput()
  }

  for (const file of valid) {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('token', deviceToken)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && total > 0) {
        const fileFraction = e.loaded / e.total
        const overall = (completed + fileFraction) / total
        progress.value = Math.round(overall * 100)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resp = JSON.parse(xhr.responseText)
          if (resp.file_url) {
            addFileMessage({
              file_url: resp.file_url,
              content: resp.file_name,
              file_size: resp.file_size,
              file_type: resp.file_type,
            }, 'self')
          }
        } catch (_) {}
        done()
      } else {
        addMessage(`Upload failed: ${file.name}`, 'system')
        done()
      }
    }

    xhr.onerror = () => {
      addMessage(`Upload error: ${file.name}`, 'system')
      done()
    }

    xhr.open('POST', `${baseUrl}/upload`)
    xhr.send(formData)
  }
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  if (centrifuge) {
    centrifuge.disconnect()
  }
})
</script>
<style scoped>
.header-title {
  margin: 0;
}

.status-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.3;
}

.own-name {
  font-size: 11px;
  opacity: 0.7;
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.2);
}

.btn-small:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sender {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 2px;
  opacity: 0.8;
}
</style>
