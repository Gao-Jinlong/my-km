import { redirect } from 'next/navigation';

export default function Home() {
    // 重定向到项目管理页面
    redirect('/projects');
}
