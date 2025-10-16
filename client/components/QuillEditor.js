'use client'

import { useEffect, useRef } from 'react'

export default function QuillEditor({ value, onChange, placeholder, modules, formats }) {
    const editorRef = useRef(null)
    const quillRef = useRef(null)
    const isUpdatingRef = useRef(false)
    const initialValueSet = useRef(false)

    useEffect(() => {
        // Only initialize once
        if (quillRef.current) return

        // Dynamic import of Quill to avoid SSR issues
        import('quill').then((Quill) => {
            if (!editorRef.current || quillRef.current) return

            const quillInstance = new Quill.default(editorRef.current, {
                theme: 'snow',
                modules: modules || {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link'],
                        ['clean']
                    ]
                },
                formats: formats || [
                    'header',
                    'bold', 'italic', 'underline', 'strike',
                    'list', 'bullet',
                    'link'
                ],
                placeholder: placeholder || 'Escribe aquí...'
            })

            // Set initial value if provided
            if (value && !initialValueSet.current) {
                isUpdatingRef.current = true
                quillInstance.root.innerHTML = value
                isUpdatingRef.current = false
                initialValueSet.current = true
            }

            // Handle content changes
            quillInstance.on('text-change', () => {
                if (isUpdatingRef.current) return
                const html = quillInstance.root.innerHTML
                if (onChange) {
                    onChange(html === '<p><br></p>' ? '' : html)
                }
            })

            quillRef.current = quillInstance
        })

        // Cleanup
        return () => {
            if (quillRef.current) {
                quillRef.current = null
            }
        }
    }, [])

    // Update editor content when value prop changes
    useEffect(() => {
        if (!quillRef.current) return

        const currentContent = quillRef.current.root.innerHTML
        const normalizedCurrent = currentContent === '<p><br></p>' ? '' : currentContent
        const normalizedValue = value || ''

        if (normalizedCurrent !== normalizedValue) {
            isUpdatingRef.current = true
            if (normalizedValue === '') {
                quillRef.current.setText('')
            } else {
                quillRef.current.root.innerHTML = normalizedValue
            }
            isUpdatingRef.current = false
        }
    }, [value])

    return (
        <div className="quill-wrapper">
            <div ref={editorRef} />
            <style dangerouslySetInnerHTML={{__html: `
                .quill-wrapper .ql-container {
                    min-height: 200px;
                }
                .quill-wrapper .ql-editor {
                    min-height: 200px;
                }
            `}} />
        </div>
    )
}
