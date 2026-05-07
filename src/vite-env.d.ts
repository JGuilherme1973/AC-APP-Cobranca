/// <reference types="vite/client" />

// Stub de tipos para otplib enquanto o pacote não está instalado.
// Execute: npm install otplib  — para habilitar a implementação real.
declare module 'otplib' {
  export const authenticator: {
    generateSecret(): string
    keyuri(accountName: string, service: string, secret: string): string
    verify(options: { token: string; secret: string }): boolean
  }
}
