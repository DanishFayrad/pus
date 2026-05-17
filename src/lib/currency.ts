const pkr = new Intl.NumberFormat('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(n: number): string {
  return 'Rs ' + pkr.format(n)
}
