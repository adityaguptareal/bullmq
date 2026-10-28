#include <iostream>
#include <vector>
using namespace std;

int main()
{
    vector<vector<int>> arr = {
        {10, 20, 30},
        {40, 50, 60}};
    cout << arr.size();
    cout << arr[0][0]; // 10
    cout << arr[1][2]; // 60

    return 0;
}