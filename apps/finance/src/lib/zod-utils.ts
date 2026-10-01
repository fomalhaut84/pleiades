import type { ZodError, ZodIssue } from 'zod'

export interface ValidationError {
  field: string
  message: string
}

/**
 * ZodError 의 issues 를 헬퍼의 표준 ValidationError[] 시그니처로 매핑한다.
 * field 는 issue.path 의 첫 segment 를 사용 (중첩 경로는 dot join).
 */
export function zodErrorsToValidation(err: ZodError): ValidationError[] {
  return err.issues.map((issue: ZodIssue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '_',
    message: issue.message,
  }))
}
