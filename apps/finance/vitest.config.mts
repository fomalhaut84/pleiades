import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // pleiades#143: 개발자 PC 의 pleiades 루트 .env(Discord 전환)가 테스트로 새지 않게 — platformEnv 는 이 경로만 본다
    env: { PLEIADES_ENV_FILE: '/nonexistent/pleiades-test.env' },
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**', 'src/lib/prisma.ts'],
    },
  },
})
