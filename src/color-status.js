const colorStatus = (status = '') => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'blue'
    case 'running':
      return 'green'
    case 'waiting':
      return 'yellow'
    case 'terminating':
      return 'red'
    default:
      return '#222222'
  }
}

export default colorStatus