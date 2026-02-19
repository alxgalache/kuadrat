'use client'

import { useState, useEffect, useRef } from 'react'
import Select, { components } from 'react-select'
import { adminAPI } from '@/lib/api'

// Country code → full name mapping (mirrors backend COUNTRY_NAMES)
const COUNTRY_NAMES = {
  ES: 'España',
  PT: 'Portugal',
  FR: 'Francia',
  IT: 'Italia',
  DE: 'Alemania',
  GB: 'Reino Unido',
  AD: 'Andorra',
}

/**
 * Generate a unique key for a postal ref (used as react-select option value).
 */
function refKey(ref) {
  if (ref.ref_type === 'country') return `country:${ref.ref_value}`
  if (ref.ref_type === 'province') return `province:${ref.ref_value}`
  return `postal_code:${ref.id}`
}

/**
 * Generate a display label for a postal ref.
 */
function refLabel(ref) {
  if (ref.ref_type === 'country') {
    const name = COUNTRY_NAMES[ref.ref_value] || ref.ref_value
    return `País · ${name} (${ref.ref_value})`
  }
  if (ref.ref_type === 'province') return `Provincia · ${ref.ref_value}`
  return `${ref.postal_code} - ${ref.city || 'Sin ciudad'}`
}

/**
 * Async multi-select component for postal codes, provinces, and countries.
 * - Searches by postal_code, city, province, or country (min 3 chars)
 * - Returns country/province group results first, then individual postal codes
 * - 300ms debounce
 * - Dropdown stays open and populated when selecting options
 *
 * @param {Array} value - Array of selected postal ref objects
 *   { ref_type: 'postal_code', id, postal_code, city, ... }
 *   { ref_type: 'province', ref_value: 'Sevilla' }
 *   { ref_type: 'country', ref_value: 'ES' }
 * @param {Function} onChange - Callback with updated selection array
 * @param {string} placeholder - Placeholder text
 * @param {boolean} isDisabled - Disable the select
 */
export default function PostalCodeSelect({
  value = [],
  onChange,
  placeholder = 'Buscar por CP, ciudad, provincia o país (min. 3 car.)...',
  isDisabled = false
}) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const debounceTimerRef = useRef(null)

  // Convert postal ref to react-select option format
  const toOption = (ref) => ({
    value: refKey(ref),
    label: refLabel(ref),
    data: ref,
  })

  // Convert react-select option back to postal ref object
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
    const refs = selectedOptions ? selectedOptions.map(fromOption) : []
    onChange(refs)
  }

  // Only update input on actual typing — ignore clear actions from selection
  const handleInputChange = (newValue, actionMeta) => {
    if (actionMeta.action === 'input-change') {
      setInputValue(newValue)
    }
  }

  // Custom Option component to style country/province differently
  const CustomOption = (props) => {
    const ref = props.data.data
    if (ref?.ref_type === 'country' || ref?.ref_type === 'province') {
      return (
        <components.Option {...props}>
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                ref.ref_type === 'country'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {ref.ref_type === 'country' ? 'País' : 'Provincia'}
            </span>
            <span>{ref.ref_type === 'country' ? `${COUNTRY_NAMES[ref.ref_value] || ref.ref_value} (${ref.ref_value})` : ref.ref_value}</span>
          </span>
        </components.Option>
      )
    }
    return <components.Option {...props} />
  }

  // Custom MultiValueLabel to show badges for country/province chips
  const CustomMultiValueLabel = (props) => {
    const ref = props.data.data
    if (ref?.ref_type === 'country') {
      return (
        <components.MultiValueLabel {...props}>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-semibold bg-blue-100 text-blue-800">
              País
            </span>
            {COUNTRY_NAMES[ref.ref_value] || ref.ref_value} ({ref.ref_value})
          </span>
        </components.MultiValueLabel>
      )
    }
    if (ref?.ref_type === 'province') {
      return (
        <components.MultiValueLabel {...props}>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-semibold bg-amber-100 text-amber-800">
              Prov
            </span>
            {ref.ref_value}
          </span>
        </components.MultiValueLabel>
      )
    }
    return <components.MultiValueLabel {...props} />
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
    multiValue: (provided, state) => {
      const ref = state.data?.data
      let bg = '#f3f4f6'
      if (ref?.ref_type === 'country') bg = '#dbeafe'
      else if (ref?.ref_type === 'province') bg = '#fef3c7'
      return {
        ...provided,
        backgroundColor: bg,
        borderRadius: '4px',
      }
    },
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
      components={{ Option: CustomOption, MultiValueLabel: CustomMultiValueLabel }}
      noOptionsMessage={noOptionsMessage}
      loadingMessage={loadingMessage}
      classNamePrefix="postal-select"
      closeMenuOnSelect={false}
      filterOption={() => true}
    />
  )
}
