'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { sellerAPI, getAuthorImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { SafeAuthorBio } from '@/components/SafeHTML'
import { useAuth } from '@/contexts/AuthContext'
import { useNotification } from '@/contexts/NotificationContext'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

function SellerProfilePageContent() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  const { logout } = useAuth()
  const { showApiError } = useNotification()
  const { showBanner } = useBannerNotification()
  const router = useRouter()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const data = await sellerAPI.getProfile()
      setProfile(data.profile)
    } catch (err) {
      setError('No se pudieron cargar los datos del perfil')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenPasswordModal = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordError('')
    setPasswordModalOpen(true)
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError('')

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Las contraseñas no coinciden')
      return
    }

    setPasswordLoading(true)
    try {
      await sellerAPI.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      )
      setPasswordModalOpen(false)
      showBanner('Tu contraseña ha sido actualizada. Inicia sesión de nuevo.')
      logout()
      router.push('/autores')
    } catch (err) {
      const message = err?.message || 'Error al cambiar la contraseña'
      setPasswordError(message)
    } finally {
      setPasswordLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Perfil no encontrado'}</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="md:flex md:items-center md:justify-between md:space-x-5">
          <div className="flex items-start space-x-5">
            <div className="shrink-0">
              <div className="relative">
                <Image
                  alt={profile.full_name || profile.email}
                  src={profile.profile_img ? getAuthorImageUrl(profile.profile_img) : `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || profile.email)}&background=random&size=128`}
                  width={64}
                  height={64}
                  className="size-16 rounded-full"
                />
                <span aria-hidden="true" className="absolute inset-0 rounded-full shadow-inner" />
              </div>
            </div>
            <div className="pt-1.5">
              <h1 className="text-2xl font-bold text-gray-900">{profile.full_name || profile.email}</h1>
              <p className="text-sm font-medium text-gray-500">Artista</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse justify-stretch space-y-4 space-y-reverse sm:flex-row-reverse sm:justify-end sm:space-y-0 sm:space-x-3 sm:space-x-reverse md:mt-0 md:flex-row md:space-x-3">
            <button
              onClick={handleOpenPasswordModal}
              className="inline-flex items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              Cambiar contraseña
            </button>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-gray-900">Biografía</h2>
            <SafeAuthorBio
              html={profile.bio}
              className="mt-2 text-sm text-gray-700 prose prose-sm max-w-none"
            />
          </div>
        )}

        {/* Details */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {profile.location && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Ubicación</dt>
              <dd className="mt-1 text-sm text-gray-900">{profile.location}</dd>
            </div>
          )}
          {profile.email && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{profile.email}</dd>
            </div>
          )}
          {profile.email_contact && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Email de contacto</dt>
              <dd className="mt-1 text-sm text-gray-900">{profile.email_contact}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Visible</dt>
            <dd className="mt-1 text-sm text-gray-900">{profile.visible ? 'Sí' : 'No'}</dd>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      <Dialog open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-gray-500/75 transition-opacity" />
        <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
              <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                Cambiar contraseña
              </DialogTitle>
              <form onSubmit={handlePasswordSubmit}>
                <div className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                      Contraseña actual
                    </label>
                    <input
                      type="password"
                      id="currentPassword"
                      required
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                      Nueva contraseña
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      required
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                    />
                    {passwordForm.newPassword.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        <li className={passwordForm.newPassword.length >= 8 ? 'text-green-600' : 'text-gray-500'}>
                          {passwordForm.newPassword.length >= 8 ? '✓' : '○'} Mínimo 8 caracteres
                        </li>
                        <li className={/[A-Z]/.test(passwordForm.newPassword) ? 'text-green-600' : 'text-gray-500'}>
                          {/[A-Z]/.test(passwordForm.newPassword) ? '✓' : '○'} Una letra mayúscula
                        </li>
                        <li className={/[a-z]/.test(passwordForm.newPassword) ? 'text-green-600' : 'text-gray-500'}>
                          {/[a-z]/.test(passwordForm.newPassword) ? '✓' : '○'} Una letra minúscula
                        </li>
                        <li className={/[0-9]/.test(passwordForm.newPassword) ? 'text-green-600' : 'text-gray-500'}>
                          {/[0-9]/.test(passwordForm.newPassword) ? '✓' : '○'} Un número
                        </li>
                      </ul>
                    )}
                    {passwordForm.newPassword.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Mínimo 8 caracteres, una mayúscula, una minúscula y un número.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                      Confirmar nueva contraseña
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      required
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                    />
                  </div>

                  <p className="text-sm text-gray-600">
                    Al guardar, se cerrará tu sesión y deberás iniciar sesión de nuevo.
                  </p>

                  {passwordError && (
                    <p className="text-sm text-red-600">{passwordError}</p>
                  )}
                </div>

                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                  <button
                    type="submit"
                    disabled={passwordLoading || passwordForm.newPassword.length < 8 || !/[A-Z]/.test(passwordForm.newPassword) || !/[a-z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword) || passwordForm.newPassword !== passwordForm.confirmPassword || !passwordForm.currentPassword}
                    className="inline-flex w-full justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:col-start-2 disabled:opacity-50"
                  >
                    {passwordLoading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordModalOpen(false)}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default function SellerProfilePage() {
  return (
    <AuthGuard requireRole="seller">
      <SellerProfilePageContent />
    </AuthGuard>
  )
}
