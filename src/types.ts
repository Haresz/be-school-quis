export type AuthenticatedUser = {
  id: string
  email?: string
}

export type AppEnv = {
  Variables: {
    requestId: string
    user?: AuthenticatedUser
    jwt?: string
    startedAt: number
    requestLogged: boolean
  }
}
