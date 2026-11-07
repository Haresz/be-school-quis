import { serve } from '@hono/node-server'
import { app } from './app.js'
import { loadEnv } from './src/config/env.js'

const env = loadEnv()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'info',
      message: 'server_started',
      port: info.port,
    }),
  )
})
