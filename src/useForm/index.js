import { createContext, useCallback, useContext, useRef } from 'react'
import { useReducerWithRef } from './useReducerWithRef'
import {
  ADVANCED_VALIDATOR,
  getFieldsValidateOnChange,
  getFieldsValidateOnValidate,
  execValidate,
} from './validate'
import { iterateDeep, getFieldFromInst } from './util'

const getInitState = (initValues) =>
  initValues?.then
    ? initValues
    : {
        values: initValues,
        submitting: false,
        submitted: false,
        failed: false,
        validationEnabled: {},
        errors: {},
        loaders: {},
      }

// совмещение асинхронной валидации с изменениями в массивах
// (изменение имени поля для setError)

export function useForm({ initValues, validators, submit }) {
  const [state, dispatch, stateRef] = useReducerWithRef(
    reducer,
    getInitState(initValues)
  )
  // для ликвидации состояния гонки
  const activePromisesRef = useRef({})

  const childFields = useChildFields(validators)

  const actions = {
    change: useCallback((name, value) => {
      dispatch({
        type: 'change',
        name,
        value,
      })

      // валидируются
      // 1. Само поле name по default если validationEnabled
      // 2. Зависимые поля по default, если у них validationEnabled
      const fieldsValidateOnChange = getFieldsValidateOnChange(
        name,
        validators,
        childFields,
        stateRef
      )
      execValidateObjects(fieldsValidateOnChange)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    enableValidation: useCallback((name) => {
      dispatch({
        type: 'enable validation',
        name,
      })

      const fieldsValidateOnChange = getFieldsValidateOnChange(
        name,
        validators,
        childFields,
        stateRef
      )

      const fieldsValidateOnValidate = getFieldsValidateOnValidate(
        name,
        validators,
        childFields,
        stateRef
      )
      execValidateObjects(fieldsValidateOnChange, fieldsValidateOnValidate)
      // console.log(fieldsValidateOnValidate)
      // валидируются
      // 1. Само поле name по default
      // 2. Зависимые поля по default
      // 3. Само поле с валидацией validate
      // 4. Зависимые поля с валидацией validate
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    validate: useCallback((name) => {
      // const validateField = getValidateField(name, validators)
      // validateField()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    setLoader: useCallback((name, value) => {
      dispatch({
        type: 'set loader',
        name,
        value,
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    setError: useCallback((name, error) => {
      dispatch({
        type: 'set error',
        name,
        error,
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  }

  function execValidateObjects(...validateObjs) {
    const erredFields = {}

    for (let validateObj of validateObjs) {
      inner: for (let fieldName in validateObj) {
        if (erredFields[fieldName]) {
          continue
        }

        const result = execValidate(
          fieldName,
          validateObj[fieldName],
          stateRef.current.values
        )
        if (result?.then) {
          activePromisesRef.current[fieldName] = result
          actions.setLoader(fieldName, true)
          result.then((err) => {
            if (activePromisesRef.current[fieldName] !== result) return

            actions.setError(fieldName, err)
            actions.setLoader(fieldName, false)
          })
        } else {
          actions.setError(fieldName, result)
        }
        if (result) {
          erredFields[fieldName] = true
          continue inner
        }
      }
    }
  }

  const Form = useCallback(function Form({ children }) {
    return (
      <form>
        <FormContext.Provider
          value={{
            ...stateRef.current,
            actions,
          }}
        >
          {children}
        </FormContext.Provider>
      </form>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { Form, actions, state }
}

export const FormContext = createContext()

function reducer(state, action) {
  switch (action.type) {
    case 'change': {
      const { name, value } = action
      return {
        ...state,
        values: {
          ...state.values,
          [name]: value,
        },
      }
    }
    case 'enable validation': {
      const { name } = action
      return {
        ...state,
        validationEnabled: {
          ...state.validationEnabled,
          [name]: true,
        },
      }
    }
    case 'set error': {
      const { name, error } = action
      return {
        ...state,
        errors: {
          ...state.errors,
          [name]: error,
        },
      }
    }
    case 'set loader': {
      const { name, loader } = action
      return {
        ...state,
        loaders: {
          ...state.loaders,
          [name]: loader,
        },
      }
    }
    default:
      throw new Error('unknown action')
  }
}

function useChildFields(validators) {
  const childFields = {}

  iterateDeep(validators, (path, val) => {
    if (val?.[ADVANCED_VALIDATOR]) {
      val.PARENTS?.forEach?.((parentName) => {
        if (!childFields[parentName]) childFields[parentName] = [path.join('.')]
        else childFields.push(path.join('.'))
      })
    }
  })

  return childFields
}

export function useField(name) {
  const { values, errors, actions } = useContext(FormContext)

  return {
    value: getFieldFromInst(name, values),
    error: errors[name],
    onChange: function onChange(value) {
      actions.change(name, value)
    },
    onEnableValidation: function onEnableValidation() {
      actions.enableValidation(name)
    },
  }
}

export const advanced = (validatorObj) => ({
  ...validatorObj,
  [ADVANCED_VALIDATOR]: true,
})
