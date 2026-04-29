<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2>Handover Chat</h2>
      <span class="status">{{ statusText }}</span>
      <button v-if="connected" class="btn btn-small" @click="reset">Reset</button>
    </div>

    <div class="messages" ref="messagesRef">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', msg.type]"
      >
        {{ msg.content }}
      </div>
    </div>

    <div class="chat-input">
      <input
        v-model="inputText"
        placeholder="Type a message..."
        :disabled="!paired"
        @keydown.enter="sendMessage"
      />
      <button class="btn" :disabled="!connected" @click="paired ? leavePair() : joinQueue()">
        {{ paired ? 'Leave' : 'Join Chat' }}
      </button>
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
const statusText = ref('Disconnected')
const messagesRef = ref(null)

let centrifuge = null
let clientId = null

const addMessage = (content, type = 'system') => {
  messages.value.push({ content, type })
  scrollToBottom()
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

const connect = () => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL

  let centrifugeConfig
  if (backendUrl) {
    centrifugeConfig = [
      { transport: 'websocket', endpoint: "wss://" + backendUrl },
      { transport: 'sse', endpoint: "https://" + backendUrl }
    ]
  } else {
    centrifugeConfig = '/centrifuge'
  }
  centrifuge = new Centrifuge(centrifugeConfig)

  centrifuge.on('connected', (ctx) => {
    clientId = ctx.client
    connected.value = true
    statusText.value = 'Connected'
    addMessage('Connected to server', 'system')
    console.log('My ID:', ctx.client)
  })

  centrifuge.on('disconnected', () => {
    connected.value = false
    paired.value = false
    statusText.value = 'Disconnected'
    addMessage('Disconnected from server', 'system')
  })

  centrifuge.on('publication', (ctx) => {
    console.log('Publication on', ctx.channel, ':', ctx.data)
    const data = ctx.data
    if (!data) return

    if (data.type === 'paired') {
      paired.value = true
      statusText.value = 'Paired'
      addMessage(`Paired with ${data.partner}`, 'system')
    } else if (data.type === 'chat') {
      const type = data.from === clientId ? 'self' : 'other'
      addMessage(data.content, type)
    } else if (data.type === 'system') {
      addMessage(data.content, 'system')
    }
  })

  centrifuge.on('subscribed', (ctx) => {
    console.log('Server subscribed:', ctx.channel)
  })

  centrifuge.connect()
}

const joinQueue = async () => {
  try {
    const res = await centrifuge.rpc('join')
    console.log('Join RPC result:', res)
    if (res && res.data) {
      if (res.data.pair_id) {
        paired.value = true
        statusText.value = 'Paired'
        addMessage(res.data.content, 'system')
      } else {
        addMessage(res.data.content, 'system')
        statusText.value = 'Waiting...'
      }
    }
  } catch (err) {
    addMessage(`Error: ${err.message}`, 'system')
  }
}

const leavePair = async () => {
  try {
    await centrifuge.rpc('leave')
    paired.value = false
    statusText.value = 'Connected'
    addMessage('Left pair', 'system')
  } catch (err) {
    addMessage(`Error: ${err.message}`, 'system')
  }
}

const reset = async () => {
  try {
    if (paired) await centrifuge.rpc('leave')
    paired.value = false
    statusText.value = 'Connected'
    addMessage('Reset', 'system')
    messages.value = []
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
.btn-small {
  padding: 4px 10px;
  font-size: 12px;
  background: rgba(255,255,255,0.2);
}
.btn-small:hover {
  background: rgba(255,255,255,0.3);
}
</style>


