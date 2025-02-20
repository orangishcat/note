import {Post} from "@/lib/network";

// export const acc = new Account(client);
// export let account: Account | null = null;

/*// This method sends the Appwrite-generated JWT to your Flask backend for verification
export async function sendAuthToServer(user_id: string) {
  const jwtResponse = await acc.createJWT();
  const jwt = jwtResponse.jwt;
  Post('/api/account/auth', {'jwt': jwt, 'user_id': user_id}).then(res => console.log("Auth sent successfully: " + res))
    .catch(err => console.error("Auth failed: " + err));
}*/

export async function logOut() {
  return Post("api/account/logout", {})
}