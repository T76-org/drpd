import { useEffect, useRef } from 'react'

export const PopoverLifecycle = ({
  onMount,
  onUnmount,
}: {
  onMount: () => void
  onUnmount: () => void
}) => {
  const onMountRef = useRef(onMount)
  const onUnmountRef = useRef(onUnmount)

  useEffect(() => {
    onMountRef.current = onMount
  }, [onMount])

  useEffect(() => {
    onUnmountRef.current = onUnmount
  }, [onUnmount])

  useEffect(() => {
    onMountRef.current()
    return () => {
      onUnmountRef.current()
    }
  }, [])

  return null
}
