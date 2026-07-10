'use client'

import {useRouter} from 'next/navigation'
import {artAPI, othersAPI} from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ProductForm from '@/components/ProductForm'
import {useNotification} from '@/contexts/NotificationContext'

function PublishProductPageContent() {
    const router = useRouter()
    const {showSuccess} = useNotification()

    const handleCreate = async (formData, productCategory) => {
        if (productCategory === 'art') {
            await artAPI.create(formData)
        } else {
            await othersAPI.create(formData)
        }
        showSuccess('Enviado', '¡Producto publicado correctamente! El producto se encuentra en revisión, y cuando se acepte aparecerá disponible en la web')
        router.push('/seller/products')
    }

    return <ProductForm mode="create" onSubmit={handleCreate} />
}

export default function PublishProductPage() {
    return (
        <AuthGuard requireRole="seller">
            <PublishProductPageContent />
        </AuthGuard>
    )
}
