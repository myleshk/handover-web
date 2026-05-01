<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2>Handover Chat</h2>
      <span class="own-name" v-if="ownName">{{ ownName }}</span>
      <span class="status">{{ statusText }}</span>
      <button v-if="connected && paired" class="btn btn-small" @click="rematch">Re-match</button>
    </div>

    <div class="messages" ref="messagesRef">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.type]">
        <span v-if="msg.showSender" class="sender">{{ msg.sender }}</span>
        {{ msg.content }}
      </div>
    </div>

    <div class="chat-input">
      <input v-model="inputText" placeholder="Type a message..." :disabled="!paired" @keydown.enter="sendMessage" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Centrifuge } from 'centrifuge'

const messages = ref([])
const inputText = ref('')
const connected = ref(false)
const paired = ref(false)
const ownName = ref('')
const partnerName = ref('')
const statusText = ref('Disconnected')
const messagesRef = ref(null)

let centrifuge = null
let clientId = null

const setUnpaired = (reason) => {
  if (paired.value) {
    paired.value = false
    partnerName.value = ''
    statusText.value = 'Waiting for partner...'
    addMessage(reason, 'system')
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

const connect = () => {
  const { VITE_BACKEND_HTTP_URL, VITE_BACKEND_WS_URL } = import.meta.env;

  centrifuge = new Centrifuge([
    { transport: 'websocket', endpoint: VITE_BACKEND_WS_URL },
    { transport: 'sse', endpoint: VITE_BACKEND_HTTP_URL + "/connection/sse" },
  ], {
    emulationEndpoint: VITE_BACKEND_HTTP_URL + "/emulation"
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

const sendMessage = async () => {
  if (!inputText.value.trim() || !paired) return
  try {
    await centrifuge.rpc('chat', { content: inputText.value.trim() })
    inputText.value = ''
  } catch (err) {
    addMessage(`Error: ${err.message}`, 'system')
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
.own-name {
  font-size: 11px;
  opacity: 0.7;
  display: block;
  margin-top: -4px;
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

