// Auth.js v5 type augmentation
// 참고: 모듈 augmentation은 v4의 'next-auth/jwt' 대신 '@auth/core/jwt'를 사용한다.

import 'next-auth'

declare module 'next-auth' {
  interface User {
    role?: string
  }

  interface Session {
    user: {
      role?: string
      name?: string | null
      email?: string | null
      image?: string | null
      id?: string
    }
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: string
  }
}
