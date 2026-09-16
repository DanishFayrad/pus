const BASE_URL = 'http://localhost:3000'

async function run() {
  console.log('--- STARTING RESTAURANT MENU CRUD TEST ---')

  // 1. Login as Admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const cookie = loginRes.headers.get('set-cookie')
  const cookieHeader = cookie ? cookie.split(';')[0] : ''
  console.log('Admin login status:', loginRes.status)

  const headers = {
    'Content-Type': 'application/json',
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  }

  // 2. Add New Dish with Custom Category and Price
  const addRes = await fetch(`${BASE_URL}/api/restaurant/menu`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Test Special Handi',
      category: 'Special Desi',
      price: 950,
      emoji: '🍲',
    }),
  })
  const addData = await addRes.json()
  console.log('POST /api/restaurant/menu result:', addRes.status, addData.item?.name, 'Price:', addData.item?.price, 'Category:', addData.item?.category)
  if (addRes.status !== 201 || !addData.item?.id) {
    throw new Error('Failed to create custom dish: ' + JSON.stringify(addData))
  }

  const newDishId = addData.item.id

  // 3. Edit Price and Category
  const editRes = await fetch(`${BASE_URL}/api/restaurant/menu/${newDishId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: 'Test Special Handi (Updated)',
      category: 'Royal Desi',
      price: 1100,
      emoji: '🍛',
    }),
  })
  const editData = await editRes.json()
  console.log('PATCH /api/restaurant/menu/[id] result:', editRes.status, editData.item?.name, 'Price:', editData.item?.price, 'Category:', editData.item?.category)
  if (editData.item?.price !== 1100 || editData.item?.category !== 'Royal Desi') {
    throw new Error('Failed to update dish price and category')
  }

  // 4. Verify in GET /api/restaurant/menu
  const getRes = await fetch(`${BASE_URL}/api/restaurant/menu`, {
    headers,
  })
  const getData = await getRes.json()
  const found = getData.items.find((i) => i.id === newDishId)
  console.log('Verified in GET /api/restaurant/menu:', Boolean(found), 'Categories list includes Royal Desi:', getData.categories.includes('Royal Desi'))
  if (!found || !getData.categories.includes('Royal Desi')) {
    throw new Error('Updated dish or category not found in GET menu')
  }

  // 5. Clean up - Delete the test dish
  const delRes = await fetch(`${BASE_URL}/api/restaurant/menu/${newDishId}`, {
    method: 'DELETE',
    headers,
  })
  console.log('DELETE test dish result:', delRes.status)

  console.log('\n======================================================')
  console.log('>>> MENU CUSTOM DISH & PRICE/CATEGORY CRUD PASSED! <<<')
  console.log('======================================================')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
