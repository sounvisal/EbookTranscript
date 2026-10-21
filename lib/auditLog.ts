import { prisma } from '@/lib/prisma'

export interface LogAdminActionParams {
  adminId: string
  adminEmail?: string | null
  action: 'ROLE_CHANGE' | 'USER_DELETE' | 'CLEAR_ERRORS' | 'PING_FLEET' | 'SYSTEM_SETTING' | string
  targetId?: string | null
  metadata?: Record<string, any> | null
  req?: Request | null
}

/**
 * Persists an administrative action to the audit log for compliance and security forensics.
 */
export async function logAdminAction({
  adminId,
  adminEmail,
  action,
  targetId,
  metadata,
  req
}: LogAdminActionParams) {
  try {
    const ipAddress = req
      ? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        req.headers.get('x-real-ip') ||
        'unknown'
      : null

    return await prisma.adminAuditLog.create({
      data: {
        adminId,
        adminEmail: adminEmail || undefined,
        action,
        targetId: targetId || undefined,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
        ipAddress: ipAddress || undefined
      }
    })
  } catch (err) {
    // Non-blocking error handling: Log failure shouldn't crash the primary action
    console.error('[AdminAuditLog] Failed to record audit log entry:', err)
    return null
  }
}
