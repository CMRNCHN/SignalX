import React, { useState, useId } from 'react';
import { getFieldAriaProps } from '../utils/accessibility';

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactElement;
  className?: string;
}

/**
 * Accessible form field wrapper with proper label association and error handling
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  hint,
  required = false,
  children,
  className = '',
}) => {
  const fieldId = useId();
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  // Clone the child input and add accessibility attributes
  const input = React.cloneElement(children, {
    id: fieldId,
    'aria-invalid': !!error,
    'aria-describedby': [errorId, hintId].filter(Boolean).join(' ') || undefined,
    'aria-required': required,
  });

  return (
    <div className={`form-field ${className}`} style={{ marginBottom: '16px' }}>
      <label
        htmlFor={fieldId}
        style={{
          display: 'block',
          marginBottom: '6px',
          color: '#E0E0E0',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        {label}
        {required && (
          <span aria-label="required" style={{ color: '#ef4444', marginLeft: '4px' }}>
            *
          </span>
        )}
      </label>

      {hint && (
        <div
          id={hintId}
          style={{
            fontSize: '0.75rem',
            color: '#9CA3AF',
            marginBottom: '6px',
          }}
        >
          {hint}
        </div>
      )}

      {input}

      {error && (
        <div
          id={errorId}
          role="alert"
          style={{
            marginTop: '6px',
            fontSize: '0.75rem',
            color: '#ef4444',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/**
 * Accessible text input with proper styling
 */
export const TextInput: React.FC<TextInputProps> = ({ error, ...props }) => {
  return (
    <input
      type="text"
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${error ? '#ef4444' : '#374151'}`,
        backgroundColor: '#1A1C1F',
        color: '#E0E0E0',
        fontSize: '0.875rem',
        outline: 'none',
        transition: 'border-color 0.2s',
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? '#ef4444' : '#374151';
        props.onBlur?.(e);
      }}
    />
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

/**
 * Accessible textarea with proper styling
 */
export const TextArea: React.FC<TextAreaProps> = ({ error, ...props }) => {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${error ? '#ef4444' : '#374151'}`,
        backgroundColor: '#1A1C1F',
        color: '#E0E0E0',
        fontSize: '0.875rem',
        outline: 'none',
        transition: 'border-color 0.2s',
        minHeight: '100px',
        resize: 'vertical',
        fontFamily: 'inherit',
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? '#ef4444' : '#374151';
        props.onBlur?.(e);
      }}
    />
  );
};

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/**
 * Accessible checkbox with label
 */
export const Checkbox: React.FC<CheckboxProps> = ({ label, className = '', ...props }) => {
  const id = useId();

  return (
    <div className={`checkbox ${className}`} style={{ display: 'flex', alignItems: 'center' }}>
      <input
        type="checkbox"
        id={id}
        {...props}
        style={{
          width: '18px',
          height: '18px',
          marginRight: '8px',
          cursor: 'pointer',
          accentColor: '#3b82f6',
          ...props.style,
        }}
      />
      <label
        htmlFor={id}
        style={{
          color: '#E0E0E0',
          fontSize: '0.875rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {label}
      </label>
    </div>
  );
};

interface RadioGroupProps {
  name: string;
  label: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  className?: string;
}

/**
 * Accessible radio button group
 */
export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  label,
  options,
  value,
  onChange,
  error,
  required = false,
  className = '',
}) => {
  const groupId = useId();
  const errorId = error ? `${groupId}-error` : undefined;

  return (
    <div className={`radio-group ${className}`} style={{ marginBottom: '16px' }}>
      <fieldset
        style={{
          border: 'none',
          padding: 0,
          margin: 0,
        }}
        aria-describedby={errorId}
        aria-required={required}
      >
        <legend
          style={{
            display: 'block',
            marginBottom: '8px',
            color: '#E0E0E0',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {label}
          {required && (
            <span aria-label="required" style={{ color: '#ef4444', marginLeft: '4px' }}>
              *
            </span>
          )}
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map((option) => {
            const optionId = `${groupId}-${option.value}`;
            return (
              <div key={option.value} style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="radio"
                  id={optionId}
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange?.(option.value)}
                  disabled={option.disabled}
                  style={{
                    width: '18px',
                    height: '18px',
                    marginRight: '8px',
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    accentColor: '#3b82f6',
                  }}
                />
                <label
                  htmlFor={optionId}
                  style={{
                    color: option.disabled ? '#6B7280' : '#E0E0E0',
                    fontSize: '0.875rem',
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {option.label}
                </label>
              </div>
            );
          })}
        </div>

        {error && (
          <div
            id={errorId}
            role="alert"
            style={{
              marginTop: '6px',
              fontSize: '0.75rem',
              color: '#ef4444',
            }}
          >
            {error}
          </div>
        )}
      </fieldset>
    </div>
  );
};

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  error?: boolean;
}

/**
 * Accessible select dropdown
 */
export const Select: React.FC<SelectProps> = ({ options, placeholder, error, ...props }) => {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${error ? '#ef4444' : '#374151'}`,
        backgroundColor: '#1A1C1F',
        color: '#E0E0E0',
        fontSize: '0.875rem',
        outline: 'none',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? '#ef4444' : '#374151';
        props.onBlur?.(e);
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// Example usage component
export const FormExample: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    subscribe: false,
    plan: '',
    country: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.plan) newErrors.plan = 'Please select a plan';

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      console.log('Form submitted:', formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '500px', margin: '0 auto' }}>
      <FormField label="Name" error={errors.name} required>
        <TextInput
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={!!errors.name}
        />
      </FormField>

      <FormField label="Email" error={errors.email} hint="We'll never share your email" required>
        <TextInput
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={!!errors.email}
        />
      </FormField>

      <FormField label="Message" hint="Optional feedback or comments">
        <TextArea
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        />
      </FormField>

      <RadioGroup
        name="plan"
        label="Select a plan"
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro - $9/month' },
          { value: 'enterprise', label: 'Enterprise - Contact us' },
        ]}
        value={formData.plan}
        onChange={(plan) => setFormData({ ...formData, plan })}
        error={errors.plan}
        required
      />

      <FormField label="Country">
        <Select
          options={[
            { value: 'us', label: 'United States' },
            { value: 'ca', label: 'Canada' },
            { value: 'uk', label: 'United Kingdom' },
            { value: 'other', label: 'Other' },
          ]}
          placeholder="Select a country"
          value={formData.country}
          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
        />
      </FormField>

      <Checkbox
        label="Subscribe to newsletter"
        checked={formData.subscribe}
        onChange={(e) => setFormData({ ...formData, subscribe: e.target.checked })}
      />

      <button
        type="submit"
        style={{
          marginTop: '24px',
          padding: '12px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        Submit
      </button>
    </form>
  );
};

