import { prisma } from "../db.js";

const generateRandomString = (length: number) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const generateUserId = async (firstName: string,lastName: string): Promise<string> => {
    
// 1. First 2 letters of firstName (Uppercase)
  const firstInitial = firstName.charAt(0).toUpperCase();
  
  // 2. Last 2 letters of lastName (Uppercase)
  const lastInitial = lastName.charAt(0).toUpperCase();

  // 3. 4 random char(before @)
  const randomPart = generateRandomString(3);

  let baseUserId = `${firstInitial}${lastInitial}${randomPart}@Chat`;
  let userId = baseUserId;
  

   // 4. Check for uniqueness in DB and append number if conflict exists
  while (await prisma.user.findFirst({ where: { userId } })) {
    const newrandomPart = generateRandomString(3);
    userId = `${firstInitial}${lastInitial}${newrandomPart}@Chat`;
  }

  return userId;
};

  
