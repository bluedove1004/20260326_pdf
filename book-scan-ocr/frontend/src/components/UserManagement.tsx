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

interface PendingUser {
  id: number;
  username: string;
  created_at: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('ocr_auth_token');
      const response = await axios.get(`${API_BASE_URL}/api/admin/pending-users`, {
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

  const formatDate = (dateStr: string) => {
    // Ensure UTC recognition and convert to Asia/Seoul
    const utcDate = dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
    return new Date(utcDate).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">사용자 승인 관리</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">회원가입 요청을 검토하고 승인합니다.</p>
        </div>
        <div className="bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
          <span className="text-xs font-bold text-brand-600 uppercase tracking-widest">Admin Control</span>
        </div>
      </div>

      {msg && (
        <div className="mb-6 bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2">
           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
           </svg>
           {msg}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-[32px] overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-widest">
              <th className="px-8 py-4">아이디</th>
              <th className="px-8 py-4 text-center">승인요청일</th>
              <th className="px-8 py-4 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-8 py-20 text-center text-gray-400 font-medium">
                  {isLoading ? '불러오는 중...' : '승인 대기 중인 사용자가 없습니다.'}
                </td>
              </tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 font-bold text-xs uppercase">
                        {u.username[0]}
                      </div>
                      <span className="font-bold text-gray-900">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center text-sm text-gray-500 font-medium tabular-nums">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button 
                      onClick={() => handleApprove(u.id)}
                      className="px-4 py-2 bg-brand-600 text-white text-xs font-black rounded-xl hover:bg-brand-700 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-brand-100"
                    >
                      승인하기
                    </button>
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
