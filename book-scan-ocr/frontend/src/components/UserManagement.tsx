
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const getApiBaseUrl = () => {
    const meta = (import.meta as any).env;
    const origin = window.location.origin;
    const base = meta.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${origin}${normalizedBase}`;
};

const API_BASE_URL = getApiBaseUrl();

interface User {
  id: number;
  username: string;
  role: string;
  status: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: '슈퍼관리자',
  admin: '관리자',
  user: '일반사용자',
};

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('ocr_auth_token');
      const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      const token = localStorage.getItem('ocr_auth_token');
      await axios.post(`${API_BASE_URL}/api/admin/approve/${id}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg('사용자가 승인되었습니다.');
      fetchUsers();
    } catch (err) {
      alert('승인 처리 중 오류 발생');
    }
  };

  const handleRoleChange = async (id: number, newRole: string) => {
    try {
      const token = localStorage.getItem('ocr_auth_token');
      await axios.post(`${API_BASE_URL}/api/admin/users/${id}/role`, { role: newRole }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg('권한이 변경되었습니다.');
      fetchUsers();
    } catch (err) {
      alert('권한 변경 중 오류 발생');
    }
  };

  const formatDate = (dateStr: string) => {
    const utcDate = dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
    return new Date(utcDate).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">사용자 권한 관리</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">사용자 승인 및 권한(슈퍼관리자, 관리자, 일반)을 관리합니다.</p>
        </div>
        <div className="bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
          <span className="text-xs font-bold text-brand-600 uppercase tracking-widest">Admin Control</span>
        </div>
      </div>

      {msg && (
        <div className="mb-6 bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 animate-bounce-in">
           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
           </svg>
           {msg}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-[24px] overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-widest">
              <th className="px-8 py-4">아이디</th>
              <th className="px-8 py-4 text-center">상태</th>
              <th className="px-8 py-4 text-center">권한 설정</th>
              <th className="px-8 py-4 text-center">가입일</th>
              <th className="px-8 py-4 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-gray-400 font-medium font-sans">
                  {isLoading ? '불러오는 중...' : '등록된 사용자가 없습니다.'}
                </td>
              </tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600 font-bold text-xs uppercase">
                        {u.username[0]}
                      </div>
                      <span className="font-bold text-gray-900">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      u.status === 'approved' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                        : 'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                      {u.status === 'approved' ? '승인완료' : '승인대기'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <select 
                      value={u.role || 'user'}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="text-xs font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-brand-500/20"
                      disabled={u.status !== 'approved'}
                    >
                      <option value="superadmin">슈퍼관리자</option>
                      <option value="admin">관리자</option>
                      <option value="user">일반사용자</option>
                    </select>
                  </td>
                  <td className="px-8 py-5 text-center text-[11px] text-gray-400 font-medium tabular-nums">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-8 py-5 text-right">
                    {u.status === 'pending' && (
                      <button 
                        onClick={() => handleApprove(u.id)}
                        className="px-4 py-1.5 bg-brand-600 text-white text-[11px] font-black rounded-lg hover:bg-brand-700 transition-all shadow-sm"
                      >
                        승인하기
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;
