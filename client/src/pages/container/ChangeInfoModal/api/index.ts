import Request from '@/utils/request';
import { IChangeParams } from './type';

export const handleChange = async (data: IChangeParams) => {
  const res = await Request.post<IChangeParams>('/auth/updateInfo', data);
  return res.data;
}