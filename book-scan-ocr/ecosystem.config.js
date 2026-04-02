module.exports = { 
   apps: [
    {
	name: 'kiom_ai_api_test',
	script: '/home/bluedove/kiom_ai_test_v2/back_server/llm_warpping/.llmvenv/bin/python', 
	args:'/home/bluedove/kiom_ai_test_v2/back_server/llm_warpping/core_api_server.py',
	cwd: '/home/bluedove/kiom_ai_test_v2/back_server/llm_warpping',
	instances: 1,
	exec_mode: 'cluster'
    }
  ]
}
