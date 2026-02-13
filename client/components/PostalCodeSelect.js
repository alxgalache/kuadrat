'use client'

import { useState, useEffect, useRef } from 'react'
import Select from 'react-select'
import { adminAPI } from '@/lib/api'

/**
 * Async multi-select component for postal codes.
 * - Searches by postal_code or city (min 3 chars)
 * - Displays format: "28001 - Madrid"
 * - 300ms debounce
 * - Max 50 results from API
 * - Dropdown stays open and populated when selecting options
 *
 * @param {Array} value - Array of selected postal code objects { id, postal_code, city, ... }
 * @param {Function} onChange - Callback with updated selection array
 * @param {string} placeholder - Placeholder text
 * @param {boolean} isDisabled - Disable the select
 */
export default function PostalCodeSelect({
  value = [],
  onChange,
  placeholder = 'Escribe para buscar (min. 3 caracteres)...',
  isDisabled = false
}) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const debounceTimerRef = useRef(null)

  // Convert postal code object to react-select option format
  const toOption = (pc) => ({
    value: pc.id,
    label: `${pc.postal_code} - ${pc.city || 'Sin ciudad'}`,
    data: pc,
  })

  // Convert react-select option back to postal code object
  const fromOption = (opt) => opt.data

  // Fetch options when inputValue changes (with debounce)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (!inputValue || inputValue.length < 3) {
      setOptions([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await adminAPI.postalCodes.search(inputValue)
        if (response.success && response.postalCodes) {
          setOptions(response.postalCodes.map(toOption))
        } else {
          setOptions([])
        }
      } catch (error) {
        console.error('Error searching postal codes:', error)
        setOptions([])
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [inputValue])

  // Handle selection change
  const handleChange = (selectedOptions) => {
    const postalCodes = selectedOptions ? selectedOptions.map(fromOption) : []
    onChange(postalCodes)
  }

  // Only update input on actual typing — ignore clear actions from selection
  const handleInputChange = (newValue, actionMeta) => {
    if (actionMeta.action === 'input-change') {
      setInputValue(newValue)
    }
  }

  // Custom styles to match Tailwind design
  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      borderColor: state.isFocused ? '#111827' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 1px #111827' : provided.boxShadow,
      '&:hover': {
        borderColor: state.isFocused ? '#111827' : '#9ca3af',
      },
      minHeight: '38px',
      fontSize: '0.875rem',
    }),
    multiValue: (provided) => ({
      ...provided,
      backgroundColor: '#f3f4f6',
      borderRadius: '4px',
    }),
    multiValueLabel: (provided) => ({
      ...provided,
      color: '#111827',
      fontSize: '0.75rem',
      padding: '2px 6px',
    }),
    multiValueRemove: (provided) => ({
      ...provided,
      color: '#6b7280',
      '&:hover': {
        backgroundColor: '#e5e7eb',
        color: '#111827',
      },
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#9ca3af',
      fontSize: '0.875rem',
    }),
    input: (provided) => ({
      ...provided,
      fontSize: '0.875rem',
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected
        ? '#111827'
        : state.isFocused
          ? '#f3f4f6'
          : 'white',
      color: state.isSelected ? 'white' : '#111827',
      fontSize: '0.875rem',
      padding: '8px 12px',
      cursor: 'pointer',
    }),
    menu: (provided) => ({
      ...provided,
      zIndex: 50,
    }),
    noOptionsMessage: (provided) => ({
      ...provided,
      fontSize: '0.875rem',
      color: '#6b7280',
    }),
    loadingMessage: (provided) => ({
      ...provided,
      fontSize: '0.875rem',
      color: '#6b7280',
    }),
  }

  // Custom messages
  const noOptionsMessage = () => {
    if (!inputValue || inputValue.length < 3) {
      return 'Escribe al menos 3 caracteres para buscar'
    }
    return 'No se encontraron resultados'
  }

  const loadingMessage = () => 'Buscando...'

  return (
    <Select
      isMulti
      options={options}
      isLoading={isLoading}
      value={value.map(toOption)}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      placeholder={placeholder}
      isDisabled={isDisabled}
      styles={customStyles}
      noOptionsMessage={noOptionsMessage}
      loadingMessage={loadingMessage}
      classNamePrefix="postal-select"
      closeMenuOnSelect={false}
      filterOption={() => true}
    />
  )
}
